import type { ReactNode } from 'react';
import { Avatar, Badge, Modal } from '../ui';

/** Anyone who can appear in a row: a group member, or a rummy player (no email or admin role). */
export interface CardPerson { name: string; avatar_url?: string | null; user_id: string | null; email?: string | null; is_admin?: boolean }

/** A quick "who is this" popup, opened by tapping someone's avatar anywhere in the app
 *  -- avatar, email, and role, plus one optional stat. */
export function MemberCardDialog({ member, extra, onClose }: { member: CardPerson | null; extra?: { label: string; node: ReactNode }; onClose(): void }) {
  if (!member) return null;
  return (
    <Modal open={!!member} onClose={onClose} title={member.name}>
      <div className="flex items-center gap-4">
        <Avatar name={member.name} src={member.avatar_url} size={64} />
        <div className="min-w-0 flex-1">
          {member.email !== undefined && <p className="truncate text-sm text-ink-2">{member.email ?? 'No email on file'}</p>}
          <div className="mt-1.5 flex gap-1.5">
            {member.is_admin ? <Badge tone="brass">Admin</Badge> : member.user_id ? <Badge tone="gain">Signed up</Badge> : <Badge>Guest</Badge>}
          </div>
        </div>
      </div>
      {extra && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
          <span className="text-[13px] text-ink-2">{extra.label}</span>
          {extra.node}
        </div>
      )}
    </Modal>
  );
}
