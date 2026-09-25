module dsh-forge-tasks-parity-gen

go 1.25

// Behavioral baseline generator for the dsh-forge M3 task 1.2 TS port
// (apps/desktop/src/main/workbench/tasks/). The forge-cli Go implementation
// is the single port authority (task 1.2 Hard Rules) — this module only
// links against it to emit fixture baselines; no code is copied here.
//
// Regeneration (optional; committed baselines are authoritative for tests):
//
//	go run . -corpus <fixtures>/corpus.json -fixtures <fixtures> -out <fixtures>/baseline.json \
//	        -commit "$(git -C Z:/project/ai/forge/forge-cli rev-parse --short HEAD)"
//
// The replace path is machine-local by design: forge-cli lives outside this
// repository (see docs/features/dsh-forge-m3/tasks/1.2-statemachine-deps-port.md
// Reference Files).
replace forge-cli => Z:/project/ai/forge/forge-cli

require forge-cli v0.0.0

require gopkg.in/yaml.v3 v3.0.1 // indirect
