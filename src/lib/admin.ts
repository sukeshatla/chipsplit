/** Client-side gate for showing the nav link and route; the real boundary is
 *  is_app_admin() in Postgres, which every admin RPC checks independently. */
const ADMIN_EMAIL = 'atlasukesh@gmail.com';

export function isAppAdmin(email: string | null | undefined) {
  return (email ?? '').toLowerCase() === ADMIN_EMAIL;
}
