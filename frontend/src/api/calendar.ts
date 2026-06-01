import { get, post, put, del } from './request'
import type { ApiResponse } from '@/types'

export interface CalendarEvent {
  id: string
  title: string
  startTime: string
  endTime: string
  allDay: boolean
  color: string
  description: string
  teamId?: string
}

export const calendarApi = {
  /** 获取当前用户所有日程 */
  getEvents(): Promise<ApiResponse<CalendarEvent[]>> {
    return get<CalendarEvent[]>('/calendar/events')
  },

  /** 创建日程 */
  createEvent(data: Omit<CalendarEvent, 'id'>): Promise<ApiResponse<CalendarEvent>> {
    return post<CalendarEvent>('/calendar/events', data)
  },

  /** 更新日程 */
  updateEvent(id: string, data: Partial<Omit<CalendarEvent, 'id'>>): Promise<ApiResponse<CalendarEvent>> {
    return put<CalendarEvent>(`/calendar/events/${id}`, data)
  },

  /** 删除日程 */
  deleteEvent(id: string): Promise<ApiResponse<void>> {
    return del<void>(`/calendar/events/${id}`)
  },
}
