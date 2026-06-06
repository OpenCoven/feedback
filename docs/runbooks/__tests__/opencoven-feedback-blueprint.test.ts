import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const blueprintPath = join(process.cwd(), 'docs/runbooks/opencoven-feedback-blueprint.json')

describe('OpenCoven feedback blueprint', () => {
  const blueprint = JSON.parse(readFileSync(blueprintPath, 'utf8')) as {
    canonicalSource: string
    products: Array<{ slug: string; publicName: string; boards: string[] }>
    boards: Array<{ slug: string; name: string; acceptedIntake: string[] }>
    roadmaps: Array<{ slug: string; name: string; public: boolean }>
    statuses: Array<{ slug: string; name: string; showOnRoadmap: boolean }>
    changelogKinds: string[]
    agentRules: string[]
    helpCenter: {
      categories: Array<{ slug: string; name: string; description: string }>
      articleRules: string[]
    }
  }

  it('makes OpenCoven Feedback the public source of truth', () => {
    expect(blueprint.canonicalSource).toBe('opencoven-feedback')
  })

  it('covers the core OpenCoven product surfaces', () => {
    expect(blueprint.products.map((product) => product.slug)).toEqual(
      expect.arrayContaining(['coven', 'cast-codes', 'feedback'])
    )
    expect(blueprint.products.map((product) => product.slug)).toHaveLength(4)
  })

  it('defines public intake boards with at least one accepted intake channel', () => {
    expect(blueprint.boards.length).toBeGreaterThanOrEqual(4)

    for (const board of blueprint.boards) {
      expect(board.slug).toMatch(/^[a-z0-9-]+$/)
      expect(board.name).toBeTruthy()
      expect(board.acceptedIntake.length).toBeGreaterThan(0)
    }
  })

  it('keeps roadmap visibility explicit and tied to public statuses', () => {
    expect(
      blueprint.roadmaps.filter((roadmap) => roadmap.public).map((roadmap) => roadmap.slug)
    ).toEqual(expect.arrayContaining(['castcodes', 'coven', 'opencoven-feedback', 'coven-code']))
    expect(blueprint.roadmaps.map((roadmap) => roadmap.slug)).not.toEqual(
      expect.arrayContaining(['now', 'next', 'later', 'shipped'])
    )
    expect(
      blueprint.statuses.filter((status) => status.showOnRoadmap).map((status) => status.slug)
    ).toEqual(expect.arrayContaining(['planned', 'in_progress', 'complete']))
  })

  it('requires agents to avoid secrets and separate public output from private context', () => {
    expect(blueprint.agentRules.join('\n')).toContain('Do not include secrets')
    expect(blueprint.agentRules.join('\n')).toContain('public-safe')
  })

  it('requires short title-case public titles', () => {
    const rules = blueprint.agentRules.join('\n')

    expect(rules).toContain('Title Case')
    expect(rules).toContain('subject-verb-object')
  })

  it('defines a scannable public help center structure', () => {
    expect(blueprint.helpCenter.categories.map((category) => category.slug)).toEqual(
      expect.arrayContaining([
        'getting-started',
        'products',
        'feedback-and-roadmaps',
        'releases-and-changelog',
        'agents-and-safety',
        'grimoire',
      ])
    )
    expect(blueprint.helpCenter.articleRules.join('\n')).toContain('Title Case')
    expect(blueprint.helpCenter.articleRules.join('\n')).toContain('public-safe')
  })
})
