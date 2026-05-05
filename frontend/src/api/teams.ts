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

  getMembers(teamId: string) {
    return get<TeamMember[]>(`/teams/${teamId}/members`)
  },

  invite(teamId: string, form: InviteForm) {
    return post(`/teams/${teamId}/invite`, form)
  },

  removeMember(teamId: string, memberId: string) {
    return del(`/teams/${teamId}/members/${memberId}`)
  },

  updateRole(teamId: string, memberId: string, role: string) {
    return put(`/teams/${teamId}/members/${memberId}`, { role })
  },

  acceptInvite(inviteToken: string) {
    return post('/teams/accept-invite', { token: inviteToken })
  },
}
