// Command tasks-parity-gen emits the Go behavioral baseline (JSON) consumed
// by the dsh-forge TS parity specs (task 1.2 对拍器). It runs the corpus
// through the authoritative forge-cli implementation (pkg/task):
//
//   - ValidateTransition over the full 7-state x 7-state x 5-role matrix,
//     capturing the formatted error string of every rejected edge;
//   - CheckTransitionDeps + GetUnmetDeps per dependency-resolution case;
//   - TopologicalSort (ordered / cycles / missing) per topological case;
//   - LoadIndex + the same probes over the real index.json snapshots
//     (phase keys `5.gate`, T- system tasks, slug map keys ≠ bare IDs) and
//     the dangling-blocker variant.
//
// Determinism note: GetUnmetDeps emits wildcard-expanded entries in Go map
// iteration order (unspecified). The TS comparator therefore compares unmet
// lists order-insensitively for wildcard cases; all other outputs
// (topological order, cycles, missing, exact-dep unmet order) are
// deterministic and compared strictly.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"forge-cli/pkg/task"
	"forge-cli/pkg/types"
)

// ---- corpus input shapes ----

type corpusEntry struct {
	Key string `json:"key"`
	task.Task
}

type corpusFile struct {
	DepCases []struct {
		Name   string       `json:"name"`
		Tasks  []corpusEntry `json:"tasks"`
		Target string       `json:"target"`
		RawDeps []string    `json:"rawDeps,omitempty"`
	} `json:"depCases"`
	ToposortCases []struct {
		Name  string        `json:"name"`
		Tasks []corpusEntry `json:"tasks"`
	} `json:"toposortCases"`
}

// ---- baseline output shapes ----

type transitionResult struct {
	From    string `json:"from"`
	To      string `json:"to"`
	Role    string `json:"role"`
	Allowed bool   `json:"allowed"`
	Error   *transitionErrorFields `json:"error,omitempty"`
}

type transitionErrorFields struct {
	// Full formatted error string (Go TransitionError.Error()).
	Message string `json:"message"`
	// Human-readable guard message (Go TransitionError.Msg).
	GuardMsg string `json:"guardMsg"`
}

type checkDepsResult struct {
	Unmet  []string `json:"unmet"`
	Error  string   `json:"error,omitempty"`
}

type depCaseResult struct {
	Name      string           `json:"name"`
	CheckDeps *checkDepsResult `json:"checkDeps"`
	// GetUnmetDeps(selfID=target, deps=rawDeps or target's own deps) — raw Go
	// output (nil marshals to null).
	Unmet []string `json:"unmet"`
}

type topoResult struct {
	Name    string   `json:"name"`
	Ordered []string `json:"ordered"`
	Cycles  []string `json:"cycles"`
	Missing []string `json:"missing"`
}

type realIndexResult struct {
	Name    string                     `json:"name"`
	Feature string                     `json:"feature"`
	Ordered []string                   `json:"ordered"`
	Cycles  []string                   `json:"cycles"`
	Missing []string                   `json:"missing"`
	// Per-task raw GetUnmetDeps (key = task ID).
	UnmetByTask map[string][]string `json:"unmetByTask"`
	// CheckTransitionDeps for every blocked task (key = task ID).
	CheckDepsByTask map[string]*checkDepsResult `json:"checkDepsByTask"`
}

type baseline struct {
	Generator      string             `json:"generator"`
	ForgeCLICommit string             `json:"forgeCliCommit"`
	GeneratedAt    string             `json:"generatedAt"`
	Transitions    []transitionResult `json:"transitions"`
	DepCases       []depCaseResult    `json:"depCases"`
	ToposortCases  []topoResult       `json:"toposortCases"`
	RealIndexes    []realIndexResult  `json:"realIndexes"`
}

func buildIndex(entries []corpusEntry) *task.TaskIndex {
	m := make(map[string]task.Task, len(entries))
	for _, e := range entries {
		m[e.Key] = e.Task
	}
	return task.NewTestIndex("corpus", m)
}

func transitionMatrix() []transitionResult {
	roles := []task.TransitionRole{
		task.RoleSubmit, task.RoleClaim, task.RoleReopen, task.RoleAuto, task.RoleManual,
	}
	var out []transitionResult
	for _, from := range types.AllStatuses() {
		for _, to := range types.AllStatuses() {
			for _, role := range roles {
				err := task.ValidateTransition(from, to, role)
				entry := transitionResult{
					From: string(from), To: string(to), Role: string(role),
					Allowed: err == nil,
				}
				if err != nil {
					var te *task.TransitionError
					if !errors.As(err, &te) {
						panic(fmt.Sprintf("non-TransitionError from ValidateTransition(%s,%s,%s): %v", from, to, role, err))
					}
					entry.Error = &transitionErrorFields{Message: te.Error(), GuardMsg: te.Msg}
				}
				out = append(out, entry)
			}
		}
	}
	return out
}

func runDepCase(name string, entries []corpusEntry, target string, rawDeps []string) depCaseResult {
	idx := buildIndex(entries)

	res := depCaseResult{Name: name}
	unmet, err := task.CheckTransitionDeps(idx, target)
	cd := &checkDepsResult{Unmet: unmet}
	if err != nil {
		cd.Error = err.Error()
	}
	res.CheckDeps = cd

	t, found := idx.ByID(target)
	deps := rawDeps
	if found && deps == nil {
		deps = t.Dependencies
	}
	res.Unmet = task.GetUnmetDeps(idx, target, deps)
	return res
}

func runTopoCase(name string, entries []corpusEntry) topoResult {
	ordered, cycles, missing := task.TopologicalSort(buildIndex(entries))
	return topoResult{Name: name, Ordered: ordered, Cycles: cycles, Missing: missing}
}

func runRealIndex(name, path string) (realIndexResult, error) {
	tmp, err := os.MkdirTemp("", "dsh-forge-parity-*")
	if err != nil {
		return realIndexResult{}, err
	}
	defer os.RemoveAll(tmp)

	idxPath := filepath.Join(tmp, "index.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return realIndexResult{}, err
	}
	if err := os.WriteFile(idxPath, data, 0o644); err != nil {
		return realIndexResult{}, err
	}
	idx, err := task.LoadIndex(idxPath)
	if err != nil {
		return realIndexResult{}, err
	}

	res := realIndexResult{
		Name:            name,
		Feature:         idx.Feature,
		UnmetByTask:     map[string][]string{},
		CheckDepsByTask: map[string]*checkDepsResult{},
	}
	res.Ordered, res.Cycles, res.Missing = task.TopologicalSort(idx)

	for key, t := range idx.TasksMap() {
		_ = key
		res.UnmetByTask[t.ID] = task.GetUnmetDeps(idx, t.ID, t.Dependencies)
		if t.Status == types.StatusBlocked {
			unmet, err := task.CheckTransitionDeps(idx, t.ID)
			cd := &checkDepsResult{Unmet: unmet}
			if err != nil {
				cd.Error = err.Error()
			}
			res.CheckDepsByTask[t.ID] = cd
		}
	}
	return res, nil
}

func main() {
	corpusPath := flag.String("corpus", "", "path to corpus.json")
	fixturesDir := flag.String("fixtures", "", "directory holding real-index-*.json snapshots")
	outPath := flag.String("out", "", "output baseline.json path")
	commit := flag.String("commit", "unknown", "forge-cli git commit used as baseline")
	flag.Parse()

	if *corpusPath == "" || *outPath == "" || *fixturesDir == "" {
		flag.Usage()
		os.Exit(2)
	}

	raw, err := os.ReadFile(*corpusPath)
	if err != nil {
		fatal(err)
	}
	var corpus corpusFile
	if err := json.Unmarshal(raw, &corpus); err != nil {
		fatal(err)
	}

	b := baseline{
		Generator:      "scripts/tasks-parity-gen (forge-cli pkg/task)",
		ForgeCLICommit: *commit,
		GeneratedAt:    time.Now().UTC().Format(time.RFC3339),
		Transitions:    transitionMatrix(),
	}

	for _, c := range corpus.DepCases {
		b.DepCases = append(b.DepCases, runDepCase(c.Name, c.Tasks, c.Target, c.RawDeps))
	}
	for _, c := range corpus.ToposortCases {
		b.ToposortCases = append(b.ToposortCases, runTopoCase(c.Name, c.Tasks))
	}

	realFiles := []struct{ name, file string }{
		{"m1", "real-index-m1.json"},
		{"m2", "real-index-m2.json"},
		{"m3", "real-index-m3.json"},
		{"m3-dangling", "real-index-m3-dangling.json"},
	}
	for _, rf := range realFiles {
		res, err := runRealIndex(rf.name, filepath.Join(*fixturesDir, rf.file))
		if err != nil {
			fatal(err)
		}
		b.RealIndexes = append(b.RealIndexes, res)
	}

	out, err := json.MarshalIndent(b, "", "  ")
	if err != nil {
		fatal(err)
	}
	out = append(out, '\n')
	if err := os.WriteFile(*outPath, out, 0o644); err != nil {
		fatal(err)
	}
	fmt.Printf("baseline written: %s (%d transitions, %d depCases, %d topoCases, %d realIndexes)\n",
		*outPath, len(b.Transitions), len(b.DepCases), len(b.ToposortCases), len(b.RealIndexes))
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "tasks-parity-gen:", err)
	os.Exit(1)
}
