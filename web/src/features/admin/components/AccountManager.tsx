import { useCallback, useEffect, useState, type FormEvent } from 'react';
import * as api from '../api.ts';
import { ApiError } from '../../../lib/api.ts';
import { dateTimeText } from '../format.ts';
import type { AdminAccount } from '../types.ts';

interface AccountManagerProps {
  /** ログイン中のアカウントID。自分の行だけは操作できないようにする */
  currentAccountId: string;
}

/**
 * 管理者アカウントの登録と削除。特権管理者にだけ表示する。
 * ここで登録したメールアドレスのGoogleアカウントが、管理画面に入れるようになる。
 */
export function AccountManager({ currentAccountId }: AccountManagerProps) {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const data = await api.listAccounts();
      setAccounts(data.accounts);
    } catch {
      setError('アカウントの一覧を読み込めませんでした');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.createAccount({ email, name: name.trim() || undefined });
      setEmail('');
      setName('');
      await reload();
    } catch (err) {
      setError(createError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (account: AdminAccount): Promise<void> => {
    setWorking(account.id);
    setError(null);
    try {
      await api.setAccountDisabled(account.id, account.disabledAt === null);
      await reload();
    } catch (err) {
      setError(actionError(err));
    } finally {
      setWorking(null);
    }
  };

  const handleDelete = async (account: AdminAccount): Promise<void> => {
    // 押し間違いを防ぐため、2回押させる
    if (confirmingDelete !== account.id) {
      setConfirmingDelete(account.id);
      return;
    }

    setWorking(account.id);
    setError(null);
    try {
      await api.deleteAccount(account.id);
      await reload();
    } catch (err) {
      setError(actionError(err));
    } finally {
      setWorking(null);
      setConfirmingDelete(null);
    }
  };

  return (
    <div className="admin-card">
      <h2 className="admin-card-title">管理者アカウント（{accounts.length}）</h2>

      <p className="notice">
        ここに登録したGoogleアカウントだけが管理画面に入れます。登録された管理者が見られるのは、
        自分が作った部屋だけです。特権管理者は .env の SUPER_ADMIN_EMAILS で決まります。
      </p>
      <p className="notice">
        アカウントを削除しても、その人が作った部屋は消えません。所有者なしの部屋として残り、
        以後は特権管理者だけが管理できます。使わない部屋は先に削除しておいてください。
      </p>

      <form className="admin-form" onSubmit={(e) => void handleSubmit(e)}>
        <div className="admin-form-row">
          <label className="field">
            <span className="field-label">メールアドレス（Googleアカウント）</span>
            <input
              className="field-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sensei@example.com"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">名前（任意）</span>
            <input
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="山田先生"
            />
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="primary-button" type="submit" disabled={submitting || !email}>
          {submitting ? '登録中…' : 'アカウントを登録'}
        </button>
      </form>

      {accounts.length === 0 ? (
        <p className="admin-empty">まだアカウントがありません。</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>メールアドレス</th>
              <th>名前</th>
              <th>権限</th>
              <th>最終ログイン</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              // 自分自身と特権管理者は、締め出しも削除もできない
              const locked = account.id === currentAccountId || account.isSuper;
              return (
                <tr key={account.id} className={account.disabledAt ? 'is-disabled' : undefined}>
                  <td>{account.email}</td>
                  <td>{account.name ?? '—'}</td>
                  <td>
                    {account.isSuper ? (
                      <span className="room-tag">特権管理者</span>
                    ) : account.disabledAt ? (
                      <span className="state-away">無効</span>
                    ) : (
                      '管理者'
                    )}
                  </td>
                  <td>{account.lastLoginAt ? dateTimeText(account.lastLoginAt) : '未ログイン'}</td>
                  <td>
                    {!locked && (
                      <>
                        <button
                          className="text-button"
                          type="button"
                          disabled={working === account.id}
                          onClick={() => void handleToggle(account)}
                        >
                          {account.disabledAt ? '有効にする' : '無効にする'}
                        </button>
                        <button
                          className={
                            confirmingDelete === account.id ? 'danger-button' : 'text-button'
                          }
                          type="button"
                          disabled={working === account.id}
                          onClick={() => void handleDelete(account)}
                        >
                          {confirmingDelete === account.id ? '本当に削除する' : '削除'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function createError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'アカウントを登録できませんでした';
  if (error.code === 'already_exists') return 'そのメールアドレスはすでに登録されています';
  if (error.code === 'invalid_input') return 'メールアドレスの形式が違います';
  if (error.code === 'forbidden') return 'アカウントを登録できるのは特権管理者だけです';
  return `登録できませんでした (${error.code})`;
}

function actionError(error: unknown): string {
  if (!(error instanceof ApiError)) return '操作できませんでした';
  if (error.code === 'cannot_delete_self' || error.code === 'cannot_modify_self') {
    return '自分自身は変更できません';
  }
  if (error.code === 'cannot_delete_super_admin' || error.code === 'cannot_modify_super_admin') {
    return '特権管理者は .env の SUPER_ADMIN_EMAILS から外してから操作してください';
  }
  return `操作できませんでした (${error.code})`;
}
