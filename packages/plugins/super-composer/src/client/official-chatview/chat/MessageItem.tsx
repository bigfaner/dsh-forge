/**
 * 官方复制件（PROVENANCE 逐文件锚）：源位 ui-chat/src/client/chat/MessageItem.tsx
 * @ deepseek-harness 0.2.0-rc.2（repo f059f01ce367748392d8f665c0705fb4302a626b，复制日期
 * 2026-10-22）。
 *
 * PROVENANCE 适配（消费子集裁剪——替身只投影 user/assistant 文本消息）：
 *   - 保留：contentParts / UserStyleBubble / UserMessageNodeView（durable 用户气泡全
 *     渲染路径——projectUserText user-text 投影、附件行、引用摘要行、IconActions 行）；
 *   - 删除：ModelRetryItem / TurnErrorItem / TurnMaxTokensItem / UnknownNodeView /
 *     ContextMessageNodeView / CompactionNodeView / PendingSteeringBubble /
 *     PendingSubmissionBubble（替身 eventSource 投影不可达的节点种类及其闭包件
 *     CompactionItem / ContextInjectionRow）；
 *   - 类型改走本地镜像面（contract/slots.js）。
 * 保留路径逐字未改。
 */
import { Fragment, memo } from 'react'
import type { ReactNode } from 'react'
import { fileExtension, FileTypeIcon, fileSizeText, projectUserText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatNodeOwnerProps, ChatNodeViewProps, ChatTranslate, UserContentBlock } from '../contract/slots.js'
import { MessageIconActions } from './MessageIconActions.js'
import css from './MessageItem.module.css'

type UserFile = Extract<UserContentBlock, { type: 'file' }>
type PresentedAttachment =
  | { readonly type: 'image'; readonly image: { readonly attachment: unknown } }
  | { readonly type: 'file'; readonly file: UserFile['attachment'] }

function contentParts(content: readonly unknown[]): {
  text: string
  attachments: PresentedAttachment[]
  rest: unknown[]
} {
  const texts: string[] = []
  const attachments: PresentedAttachment[] = []
  const rest: unknown[] = []
  for (const block of content) {
    const b = block as { type?: string; text?: string; attachment?: unknown }
    if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text)
    else if (b.type === 'image' && b.attachment !== undefined) {
      attachments.push({ type: 'image', image: { attachment: b.attachment } })
    }
    else if (b.type === 'file' && b.attachment !== undefined) {
      attachments.push({ type: 'file', file: (block as UserFile).attachment })
    }
    else rest.push(block)
  }
  return { text: texts.join(''), attachments, rest }
}

/** Right-aligned bubble shared by user and steering rows. */
function UserStyleBubble({
  content, renderMessageImages, referenceLabels = [], skillNames = [],
  actions, references, t,
}: {
  content: readonly unknown[]
  renderMessageImages: ChatNodeOwnerProps['renderMessageImages']
  /** Optional IconActions (or similar) below the bubble; receives the joined text. */
  actions?: (text: string) => ReactNode
  /** Exact session mention labels associated by the adjacent recall node. */
  referenceLabels?: readonly string[]
  /** Skill names the step's `skill-invocation` injections loaded for this message. */
  skillNames?: readonly string[]
  references?: Pick<ChatNodeOwnerProps, 'openFile' | 'openSkill'>
  t: ChatTranslate
}): ReactNode {
  const { text, attachments: contentAttachments, rest } = contentParts(content)
  const attachments = contentAttachments
  const compactImages = attachments.length > 1
  const showBubble = text !== '' || rest.length > 0
  return (
    <div
      className={css.userRow}
    >
      <div className={css.userStack}>
        {attachments.length > 0 && (
          <div className={css.attachmentRow} data-message-attachments>
            {attachments.map((attachment, index) => attachment.type === 'image'
              ? (
                <Fragment key={`image:${index}`}>
                  {renderMessageImages({
                    images: [attachment.image],
                    align: 'end',
                    compact: compactImages,
                  })}
                </Fragment>
              )
              : (
                <span key={`file:${index}`} className={css.fileCard} title={attachment.file.name}>
                  <FileTypeIcon path={attachment.file.name} className={css.fileIcon} />
                  <span className={css.fileContent}>
                    <span className={css.fileName}>{attachment.file.name}</span>
                    <span className={css.fileMeta}>
                      {[fileExtension(attachment.file.name).toUpperCase().slice(0, 8), fileSizeText(attachment.file.bytes)]
                        .filter(Boolean).join(' ')}
                    </span>
                  </span>
                </span>
              ))}
          </div>
        )}
        {showBubble && <div className={css.bubble}>
          {projectUserText(text, referenceLabels, skillNames, 'skill', references)}
          {rest.map((block, i) => <span key={i}>{JSON.stringify(block)}</span>)}
        </div>}
        {referenceLabels.length > 0 && (
          <div className={css.referenceSummary}>
            {t('message.referenceSummary', { labels: referenceLabels.join(t('message.referenceSeparator')) })}
          </div>
        )}
      </div>
      {actions?.(text)}
    </div>
  )
}

/** User and admitted-steering keyed Chat renderer. */
export const UserMessageNodeView = memo(function UserMessageNodeView({
  node, renderMessageImages, openFile, openSkill, t,
}: ChatNodeViewProps<'user' | 'steering'>) {
  const data = node.data as {
    content: readonly unknown[]
    referenceLabels?: readonly string[]
    skillNames?: readonly string[]
    time?: number
  }
  return (
    <UserStyleBubble
      content={data.content}
      references={{ openFile, openSkill }}
      renderMessageImages={renderMessageImages}
      {...data.referenceLabels === undefined ? {} : { referenceLabels: data.referenceLabels }}
      {...data.skillNames === undefined ? {} : { skillNames: data.skillNames }}
      t={t}
      actions={text => (
        <MessageIconActions
          text={text}
          time={data.time}
          clock="start"
          className={css.actions}
          t={t}
        />
      )}
    />
  )
})
