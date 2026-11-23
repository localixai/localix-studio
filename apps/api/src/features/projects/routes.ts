import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '../../lib/validator'

import { defaultErrorHandler } from '../../lib/http'
import type { AppContext } from '../../app'
import {
  type CreateProjectRequest,
  type ExpandRefsRequest,
  type ExpandRefsResponse,
  type Project,
  type ResolveProjectByPathResponse,
  type UpdateProjectRequest,
  createProjectRequestSchema,
  expandRefsRequestSchema,
  expandRefsResponseSchema,
  listProjectsResponseSchema,
  projectParamsSchema,
  projectSchema,
  resolveProjectByPathRequestSchema,
  resolveProjectByPathResponseSchema,
  updateProjectRequestSchema,
} from './contracts'
import {
  type InspectPathResponse,
  inspectPathRequestSchema,
  inspectPathResponseSchema,
} from './inspect-path'
import {
  type GitActivityResponse,
  type GitDayResponse,
  gitActivityResponseSchema,
  gitDayResponseSchema,
} from './git-activity'

export interface ProjectsRoutesService {
  listProjects(userId: string): Promise<{ projects: Project[] }>
  createProject(userId: string, input: CreateProjectRequest): Promise<Project>
  resolveProjectByPath(userId: string, inputPath: string): Promise<ResolveProjectByPathResponse>
  inspectPath(userId: string, inputPath: string): Promise<InspectPathResponse>
  getProject(userId: string, id: string): Promise<Project>
  updateProject(userId: string, id: string, patch: UpdateProjectRequest): Promise<Project>
  deleteProject(userId: string, id: string): Promise<void>
  pickDirectory(): Promise<{ path: string | null }>
  pickFiles(): Promise<{ paths: string[] }>
  expandRefs(userId: string, input: ExpandRefsRequest): Promise<ExpandRefsResponse>
  openProjectDirectory(userId: string, id: string): Promise<{ opened: true }>
  gitActivity(userId: string, id: string, timeZone: string): Promise<GitActivityResponse>
  gitDay(userId: string, id: string, from: number, to: number): Promise<GitDayResponse>
}

export function createProjectsRoutes(service: ProjectsRoutesService) {
  const app = new Hono<AppContext>()

  const routes = app
    .get('/', async (c) => {
      const response = await service.listProjects(c.get('userId'))
      return c.json(listProjectsResponseSchema.parse(response), 200)
    })
    .post('/', zValidator('json', createProjectRequestSchema), async (c) => {
      const body = c.req.valid('json')
      const response = await service.createProject(c.get('userId'), body)
      return c.json(projectSchema.parse(response), 201)
    })
    .post('/resolve-path', zValidator('json', resolveProjectByPathRequestSchema), async (c) => {
      const { path } = c.req.valid('json')
      const response = await service.resolveProjectByPath(c.get('userId'), path)
      return c.json(resolveProjectByPathResponseSchema.parse(response), 200)
    })
    .post('/inspect-path', zValidator('json', inspectPathRequestSchema), async (c) => {
      const { path } = c.req.valid('json')
      const response = await service.inspectPath(c.get('userId'), path)
      return c.json(inspectPathResponseSchema.parse(response), 200)
    })
    .post('/expand-refs', zValidator('json', expandRefsRequestSchema), async (c) => {
      const response = await service.expandRefs(c.get('userId'), c.req.valid('json'))
      return c.json(expandRefsResponseSchema.parse(response), 200)
    })
    .post('/pick-dir', async (c) => {
      const response = await service.pickDirectory()
      return c.json(response, 200)
    })
    .post('/pick-files', async (c) => {
      const response = await service.pickFiles()
      return c.json(response, 200)
    })
    .post('/:id/open', zValidator('param', projectParamsSchema), async (c) => {
      const { id } = c.req.valid('param')
      const response = await service.openProjectDirectory(c.get('userId'), id)
      return c.json(response, 200)
    })
    .get(
      '/:id/git-activity',
      zValidator('param', projectParamsSchema),
      zValidator('query', z.object({ timeZone: z.string().max(64).default('UTC') })),
      async (c) => {
        const { id } = c.req.valid('param')
        const { timeZone } = c.req.valid('query')
        const response = await service.gitActivity(c.get('userId'), id, timeZone)
        return c.json(gitActivityResponseSchema.parse(response), 200)
      },
    )
    .get(
      '/:id/git-activity/day',
      zValidator('param', projectParamsSchema),
      zValidator(
        'query',
        z
          .object({ from: z.coerce.number().int().min(0), to: z.coerce.number().int().min(0) })
          .refine((range) => range.to > range.from && range.to - range.from <= 2 * 86_400_000),
      ),
      async (c) => {
        const { id } = c.req.valid('param')
        const { from, to } = c.req.valid('query')
        const response = await service.gitDay(c.get('userId'), id, from, to)
        return c.json(gitDayResponseSchema.parse(response), 200)
      },
    )
    .get('/:id', zValidator('param', projectParamsSchema), async (c) => {
      const { id } = c.req.valid('param')
      const response = await service.getProject(c.get('userId'), id)
      return c.json(projectSchema.parse(response), 200)
    })
    .patch(
      '/:id',
      zValidator('param', projectParamsSchema),
      zValidator('json', updateProjectRequestSchema),
      async (c) => {
        const { id } = c.req.valid('param')
        const body = c.req.valid('json')
        const response = await service.updateProject(c.get('userId'), id, body)
        return c.json(projectSchema.parse(response), 200)
      },
    )
    .delete('/:id', zValidator('param', projectParamsSchema), async (c) => {
      const { id } = c.req.valid('param')
      await service.deleteProject(c.get('userId'), id)
      return c.body(null, 204)
    })

  routes.onError(defaultErrorHandler)

  return routes
}
