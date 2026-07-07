import { get, post, put, del } from './request'
import type { Team, TeamMember, InviteForm } from '@/types'

export const teamsApi = {
  getTeams() {
    return get<Team[]>('/teams')
  },

  createTeam(name: string) {
    return post<Team>('/teams', { name })
  },

  updateTeam(id: string, data: Partial<Team>) {
    return put<Team>(`/teams/${id}`, data)
  },

  deleteTeam(id: string) {
    return del(`/teams/${id}`)
  },

  // 后端使用 organizationId（从 JWT 中提取），不需要 teamId
  getMembers(_teamId: string) {
    return get<TeamMember[]>('/teams/members')
  },

  invite(_teamId: string, form: InviteForm) {
    return post('/teams/members/invite', form)
  },

  removeMember(_teamId: string, memberId: string) {
    return del(`/teams/members/${memberId}`)
  },

  updateRole(_teamId: string, memberId: string, role: string) {
    return put(`/teams/members/${memberId}/role`, { role })
  },

  acceptInvite(inviteToken: string) {
    return post('/teams/accept-invite', { token: inviteToken })
  },
}
