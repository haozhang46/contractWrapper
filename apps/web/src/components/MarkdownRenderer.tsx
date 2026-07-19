import { type ReactElement, type ReactNode } from 'react'

interface MarkdownRendererProps {
  content: string
}

/** Simple regex-based markdown to React elements renderer. */
export default function MarkdownRenderer({ content }: MarkdownRendererProps): ReactElement {
  const lines = content.split('\n')
  const elements: ReactElement[] = []
  let inCodeBlock = false
  let codeLang = ''
  const codeLines: string[] = []

  function flushCodeBlock(): void {
    if (codeLines.length === 0) return
    elements.push(
      <pre key={elements.length} className="wiki-markdown__code-block">
        <code>{codeLines.join('\n')}</code>
      </pre>,
    )
    codeLines.length = 0
  }

  // Process line by line
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trimEnd()

    // Code fence toggle
    if (/^```/.test(line)) {
      if (inCodeBlock) {
        flushCodeBlock()
        inCodeBlock = false
        codeLang = ''
      } else {
        inCodeBlock = true
        codeLang = line.slice(3).trim()
      }
      i++
      continue
    }

    if (inCodeBlock) {
      codeLines.push(raw) // preserve original indentation inside code blocks
      i++
      continue
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      elements.push(<hr key={elements.length} className="wiki-markdown__hr" />)
      i++
      continue
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headerMatch) {
      const level = headerMatch[1].length
      const content = headerMatch[2]
      const className = `wiki-markdown__h${level}`
      const el = (() => {
        switch (level) {
          case 1: return <h1 key={elements.length} className={className}>{renderInline(content)}</h1>
          case 2: return <h2 key={elements.length} className={className}>{renderInline(content)}</h2>
          case 3: return <h3 key={elements.length} className={className}>{renderInline(content)}</h3>
          case 4: return <h4 key={elements.length} className={className}>{renderInline(content)}</h4>
          case 5: return <h5 key={elements.length} className={className}>{renderInline(content)}</h5>
          case 6: return <h6 key={elements.length} className={className}>{renderInline(content)}</h6>
          default: return <h2 key={elements.length} className={className}>{renderInline(content)}</h2>
        }
      })()
      elements.push(el)
      i++
      continue
    }

    // Unordered list
    const ulMatch = line.match(/^[-*+]\s+(.+)$/)
    if (ulMatch) {
      const items: ReactElement[] = []
      items.push(<li key={0}>{renderInline(ulMatch[1])}</li>)
      i++
      // Collect continuation lines (next list items or indented continuation)
      while (i < lines.length) {
        const nextRaw = lines[i].trimEnd()
        const nextItem = nextRaw.match(/^[-*+]\s+(.+)$/)
        if (nextItem) {
          items.push(<li key={items.length}>{renderInline(nextItem[1])}</li>)
          i++
          continue
        }
        // Indented continuation line for previous item
        if (/^\s{2,}\S/.test(nextRaw)) {
          const lastIdx = items.length - 1
          const prevChildren = (items[lastIdx].props as { children: ReactNode }).children
          items[lastIdx] = (
            <li key={lastIdx}>
              {prevChildren}
              <br />
              {nextRaw.trim()}
            </li>
          )
          i++
          continue
        }
        break
      }
      elements.push(<ul key={elements.length}>{items}</ul>)
      continue
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.+)$/)
    if (olMatch) {
      const items: ReactElement[] = []
      items.push(<li key={0}>{renderInline(olMatch[1])}</li>)
      i++
      while (i < lines.length) {
        const nextRaw = lines[i].trimEnd()
        const nextItem = nextRaw.match(/^\d+\.\s+(.+)$/)
        if (nextItem) {
          items.push(<li key={items.length}>{renderInline(nextItem[1])}</li>)
          i++
          continue
        }
        if (/^\s{2,}\S/.test(nextRaw)) {
          const lastIdx = items.length - 1
          const prevChildren = (items[lastIdx].props as { children: ReactNode }).children
          items[lastIdx] = (
            <li key={lastIdx}>
              {prevChildren}
              <br />
              {nextRaw.trim()}
            </li>
          )
          i++
          continue
        }
        break
      }
      elements.push(<ol key={elements.length}>{items}</ol>)
      continue
    }

    // Empty line => paragraph break (skip, next non-empty line starts new para)
    if (line === '') {
      i++
      continue
    }

    // Paragraph: collect consecutive non-empty lines
    const paraLines: string[] = [line]
    i++
    while (i < lines.length) {
      const nextLine = lines[i].trimEnd()
      if (nextLine === '' || /^(#{1,6}\s|\d+\.\s|[-*+]\s|-{3,}|```)/.test(nextLine)) {
        break
      }
      paraLines.push(nextLine)
      i++
    }
    elements.push(
      <p key={elements.length} className="wiki-markdown__paragraph">
        {paraLines.map((pl, idx) => (
          <span key={idx}>
            {idx > 0 && <br />}
            {renderInline(pl)}
          </span>
        ))}
      </p>,
    )
  }

  // Flush any remaining code block
  if (inCodeBlock) flushCodeBlock()

  return <div className="wiki-markdown">{elements}</div>
}

/** Render inline markdown syntax within a line of text. */
function renderInline(text: string): (string | ReactElement)[] {
  // Process tokens: code, bold, italic, link, strikethrough
  const tokens: (string | ReactElement)[] = [text]

  // Inline code (highest priority, before other formatting)
  tokens.length = 0
  let remaining = text
  while (remaining.length > 0) {
    const codeMatch = remaining.match(/`([^`]+)`/)
    if (!codeMatch) break

    const before = remaining.slice(0, codeMatch.index)
    if (before) tokens.push(before)
    tokens.push(<code key={tokens.length} className="wiki-markdown__inline-code">{codeMatch[1]}</code>)
    remaining = remaining.slice((codeMatch.index ?? 0) + codeMatch[0].length)
  }
  if (remaining) tokens.push(remaining)

  // Process bold/italic/links within each text token
  const processed: (string | ReactElement)[] = []
  for (const token of tokens) {
    if (typeof token !== 'string') {
      processed.push(token)
      continue
    }
    processed.push(...parseInlineFormatting(token))
  }

  return processed
}

interface FormatMatch {
  index: number
  length: number
  type: 'bold' | 'italic' | 'link' | 'strikethrough'
  content: string
  href?: string
}

/** Find the next formatting match in a string. */
function nextFormat(text: string): FormatMatch | null {
  // Bold **text**
  const boldMatch = text.match(/\*\*(.+?)\*\*/)
  // Italic *text* (but not **)
  const italicMatch = text.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/)
  // Strikethrough ~~text~~
  const strikeMatch = text.match(/~~(.+?)~~/)
  // Link [text](url)
  const linkMatch = text.match(/\[([^\]]+)\]\(([^)]+)\)/)

  const candidates: FormatMatch[] = []

  if (boldMatch) {
    candidates.push({ index: boldMatch.index!, length: boldMatch[0].length, type: 'bold', content: boldMatch[1] })
  }
  if (italicMatch) {
    candidates.push({ index: italicMatch.index!, length: italicMatch[0].length, type: 'italic', content: italicMatch[1] })
  }
  if (strikeMatch) {
    candidates.push({ index: strikeMatch.index!, length: strikeMatch[0].length, type: 'strikethrough', content: strikeMatch[1] })
  }
  if (linkMatch) {
    candidates.push({ index: linkMatch.index!, length: linkMatch[0].length, type: 'link', content: linkMatch[1], href: linkMatch[2] })
  }

  if (candidates.length === 0) return null

  // Sort by index, then by length descending (prefer longer match at same position)
  candidates.sort((a, b) => a.index - b.index || b.length - a.length)
  return candidates[0]
}

/** Parse bold, italic, link, and strikethrough formatting in a text string. */
function parseInlineFormatting(text: string): (string | ReactElement)[] {
  const result: (string | ReactElement)[] = []
  let remaining = text

  while (remaining.length > 0) {
    const match = nextFormat(remaining)
    if (!match) break

    // Text before the match
    if (match.index > 0) {
      result.push(remaining.slice(0, match.index))
    }

    // The formatted element
    const key = result.length
    const inner = match.type === 'link' ? match.content : renderInline(match.content)

    switch (match.type) {
      case 'bold':
        result.push(<strong key={key}>{inner}</strong>)
        break
      case 'italic':
        result.push(<em key={key}>{inner}</em>)
        break
      case 'strikethrough':
        result.push(<del key={key}>{inner}</del>)
        break
      case 'link':
        result.push(
          <a key={key} href={match.href} className="wiki-markdown__link" target="_blank" rel="noopener noreferrer">
            {match.content}
          </a>,
        )
        break
    }

    remaining = remaining.slice(match.index + match.length)
  }

  if (remaining) result.push(remaining)

  return result
}
