export interface StaffContact {
  uid: string
  name: string
}
export interface StaffMessage {
  id: string
  sequence: number
  senderUid: string
  senderName: string
  text: string
  sentAt: number | null
}
export interface StaffChat {
  id: string
  participantUids: string[]
  participantNames: Record<string, string>
  updatedAt: number | null
  lastSequence: number
  lastMessage: Omit<StaffMessage, 'id'> | null
  readBy: Record<string, { sequence: number; readAt: number | null; name: string }>
}
export interface MessagingLive<T> {
  rows: T[]
  status: 'connecting' | 'live' | 'reconnecting' | 'error'
  error?: string
  more?: boolean
}
export const chatTitle = (chat: StaffChat, uid: string) =>
  chat.participantUids
    .filter((p) => p !== uid)
    .map((p) => chat.participantNames[p] || p)
    .join(', ')
export const chatUnread = (chat: StaffChat, uid: string) =>
  !!chat.lastMessage &&
  chat.lastMessage.senderUid !== uid &&
  chat.lastSequence > (chat.readBy[uid]?.sequence ?? 0)
export function messageReaders(chat: StaffChat, message: StaffMessage) {
  return chat.participantUids
    .filter((p) => p !== message.senderUid && (chat.readBy[p]?.sequence ?? 0) >= message.sequence)
    .map((uid) => ({
      uid,
      name: chat.readBy[uid]?.name || chat.participantNames[uid] || uid,
      readAt: chat.readBy[uid]?.readAt ?? null,
    }))
}
