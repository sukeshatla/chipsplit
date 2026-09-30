import type { ReactNode } from 'react';
import { Avatar, Badge, Modal } from '../ui';
import type { Member } from '../../lib/types';

/** A quick "who is this" popup, opened by clicking a member's name anywhere in a group
 *  (balances, settle-up, the leaderboard) -- avatar, email, and role, plus one optional stat. */
export function MemberCardDialog({ member, extra, onClose }: { member: Member | null; extra?: { label: string; node: ReactNode }; onClose(): void }) {
  if (!member) return null;
  return (
    <Modal open={!!member} onClose={onClose} title={member.name}>
      <div className="flex items-center gap-4">
        <Avatar name={member.name} src={member.avatar_url} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink-2">{member.email ?? 'No email on file'}</p>
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
