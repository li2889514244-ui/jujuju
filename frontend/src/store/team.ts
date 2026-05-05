import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { teamsApi } from '@/api/teams'
import type { Team, TeamMember, InviteForm } from '@/types'

export const useTeamStore = defineStore('team', () => {
  const teams = ref<Team[]>([])
  const currentTeam = ref<Team | null>(null)
  const members = ref<TeamMember[]>([])
  const loading = ref(false)

  const currentTeamId = computed(() => currentTeam.value?.id || '')

  async function fetchTeams() {
    loading.value = true
    try {
      const res = await teamsApi.getTeams()
      teams.value = res.data
      if (!currentTeam.value && teams.value.length > 0) {
        currentTeam.value = teams.value[0]
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchMembers(teamId?: string) {
    const id = teamId || currentTeamId.value
    if (!id) return
    const res = await teamsApi.getMembers(id)
    members.value = res.data
  }

  async function inviteMember(form: InviteForm) {
    const res = await teamsApi.invite(currentTeamId.value, form)
    await fetchMembers()
    return res
  }

  async function removeMember(memberId: string) {
    await teamsApi.removeMember(currentTeamId.value, memberId)
    await fetchMembers()
  }

  async function updateMemberRole(memberId: string, role: string) {
    await teamsApi.updateRole(currentTeamId.value, memberId, role)
    await fetchMembers()
  }

  function switchTeam(team: Team) {
    currentTeam.value = team
  }

  return {
    teams,
    currentTeam,
    members,
    loading,
    currentTeamId,
    fetchTeams,
    fetchMembers,
    inviteMember,
    removeMember,
    updateMemberRole,
    switchTeam,
  }
})
