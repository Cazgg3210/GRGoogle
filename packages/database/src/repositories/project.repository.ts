import type { Id, Project, ProjectAlias, ProjectRepository } from '@smlxl/domain'
import { projectToDb, toProject, toProjectAlias } from '../mappers/catalogs.js'
import { BaseRepository } from './base.js'

export class PrismaProjectRepository extends BaseRepository implements ProjectRepository {
  async findById(id: Id): Promise<Project | null> {
    const row = await this.db.project.findUnique({ where: { id } })
    return row ? toProject(row) : null
  }

  async findByAlias(aliasNormalized: string): Promise<Project | null> {
    const alias = await this.db.projectAlias.findUnique({
      where: { aliasNormalized },
      include: { project: true },
    })
    return alias ? toProject(alias.project) : null
  }

  async list(activeOnly = false): Promise<Project[]> {
    const rows = await this.db.project.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { canonicalName: 'asc' },
    })
    return rows.map(toProject)
  }

  async save(project: Project): Promise<Project> {
    const { id, ...rest } = projectToDb(project)
    const row = await this.db.project.upsert({
      where: { id: project.id },
      create: { id, ...rest },
      update: rest,
    })
    return toProject(row)
  }

  async addAlias(alias: Omit<ProjectAlias, 'id'>): Promise<ProjectAlias> {
    const row = await this.db.projectAlias.upsert({
      where: { aliasNormalized: alias.aliasNormalized },
      create: { projectId: alias.projectId, aliasNormalized: alias.aliasNormalized, source: alias.source },
      update: { projectId: alias.projectId, source: alias.source },
    })
    return toProjectAlias(row)
  }

  async listAliases(): Promise<ProjectAlias[]> {
    const rows = await this.db.projectAlias.findMany({ orderBy: { aliasNormalized: 'asc' } })
    return rows.map(toProjectAlias)
  }
}
