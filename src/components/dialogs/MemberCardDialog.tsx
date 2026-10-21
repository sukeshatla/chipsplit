import type { ReactNode } from 'react';
import { UserPlus } from 'lucide-react';
import { Avatar, Badge, Button, Modal } from '../ui';
import { useAction, useData } from '../../app/data';

/** Anyone who can appear in a row: a group member, or a rummy player (no email or admin role). */
export interface CardPerson { name: string; avatar_url?: string | null; user_id: string | null; email?: string | null; is_admin?: boolean }

/** A quick "who is this" popup, opened by tapping someone's avatar anywhere in the app
 *  -- avatar, email, and role, plus one optional stat. */
export function MemberCardDialog({ member, extra, actions, onClose }: { member: CardPerson | null; extra?: { label: string; node: ReactNode }; actions?: ReactNode; onClose(): void }) {
  const data = useData();
  const { run, busy } = useAction();
  if (!member) return null;
  // Add as friend (SPEC FRIEND-11): only someone signed up, not you, not already a friend. Rummy
  // players carry no email, so it comes from any group row of theirs.
  const uid = member.user_id;
  const email = member.email ?? (uid ? data.groups.flatMap((g) => g.members).find((m) => m.user_id === uid && m.email)?.email : null);
  const canAdd = !!uid && !!email && uid !== data.me.id && !data.contacts.some((c) => c.user_id === uid);
  const addFriend = () => run((api) => api.addContact(member.name, email!), `${member.name} added to your friends`);
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
      {(actions || canAdd) && (
        <div className="mt-4 space-y-2">
          {canAdd && <Button className="w-full" loading={busy} onClick={addFriend}><UserPlus size={16} aria-hidden="true" />Add as friend</Button>}
          {actions}
        </div>
      )}
    </Modal>
  );
}
