import { Hono } from 'hono';
import { z } from 'zod';
import { isSuperAdminEmail } from '../config.js';
import { requireSuperAdmin, type AdminEnv } from '../middleware/admin.js';
import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  normalizeEmail,
  setAccountDisabled,
} from '../repos/admin-accounts.js';
import type { AdminAccount } from '../types.js';

const createAccountSchema = z.object({
  email: z.email('メールアドレスの形式が違います').max(200),
  name: z.string().trim().max(80).optional(),
});

const updateAccountSchema = z.object({
  disabled: z.boolean(),
});

/** 画面に出す形。特権かどうかは .env と突き合わせてここで足す */
function publicAccount(account: AdminAccount): AdminAccount & { isSuper: boolean } {
  return { ...account, isSuper: isSuperAdminEmail(account.email) };
}

export const adminAccountsRoute = new Hono<AdminEnv>();

// アカウントの登録は特権の入り口なので、まるごと特権管理者だけに閉じる
adminAccountsRoute.use('*', requireSuperAdmin);

adminAccountsRoute.get('/', (c) => c.json({ accounts: listAccounts().map(publicAccount) }));

adminAccountsRoute.post('/', async (c) => {
  const parsed = createAccountSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, 400);
  }

  const account = createAccount({
    email: normalizeEmail(parsed.data.email),
    name: parsed.data.name ?? null,
    createdBy: c.get('admin').account.id,
  });
  if (!account) return c.json({ error: 'already_exists' }, 409);

  return c.json({ account: publicAccount(account) }, 201);
});

/** 一時的な締め出しと、その解除 */
adminAccountsRoute.patch('/:id', async (c) => {
  const parsed = updateAccountSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);

  const target = getAccount(c.req.param('id'));
  if (!target) return c.json({ error: 'not_found' }, 404);

  // 自分を締め出すと、そのまま誰も入れない状態を作りかねない
  if (target.id === c.get('admin').account.id) {
    return c.json({ error: 'cannot_modify_self' }, 400);
  }
  // .env の特権管理者は、ここで止めても次のログインで作り直される
  if (isSuperAdminEmail(target.email)) {
    return c.json({ error: 'cannot_modify_super_admin' }, 400);
  }

  const account = setAccountDisabled(target.id, parsed.data.disabled);
  if (!account) return c.json({ error: 'not_found' }, 404);
  return c.json({ account: publicAccount(account) });
});

/**
 * アカウントの削除。
 * その人が作った部屋は消さず、所有者なしにして残す。以後は特権管理者だけが管理できる。
 */
adminAccountsRoute.delete('/:id', (c) => {
  const target = getAccount(c.req.param('id'));
  if (!target) return c.json({ error: 'not_found' }, 404);

  if (target.id === c.get('admin').account.id) {
    return c.json({ error: 'cannot_delete_self' }, 400);
  }
  if (isSuperAdminEmail(target.email)) {
    return c.json(
      { error: 'cannot_delete_super_admin', message: '先に .env の SUPER_ADMIN_EMAILS から外してください' },
      400,
    );
  }

  const result = deleteAccount(target.id);
  if (!result.ok) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true, orphanedRooms: result.orphanedRooms });
});
