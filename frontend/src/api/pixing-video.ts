import { get, post } from './request'

export interface PixingVideoTask {
  id: string
  teacher: string
  text: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  videoUrl?: string | null
  srtContent?: string | null
  error?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTaskParams {
  teacher: string
  text: string
}

export const pixingVideoApi = {
  createTask(data: CreateTaskParams) {
    return post<PixingVideoTask>('/pixing-video/tasks', data)
  },

  listTasks(status?: string) {
    return get<PixingVideoTask[]>('/pixing-video/tasks', status ? { status } : undefined)
  },

  getTask(id: string) {
    return get<PixingVideoTask>(`/pixing-video/tasks/${id}`)
  },
}
