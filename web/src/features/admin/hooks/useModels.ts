import { useEffect, useState } from 'react';
import * as api from '../api.ts';

export interface ModelOptions {
  /** AI Engine が返したモデルID。取れなかったときは空 */
  models: string[];
  /** 一覧を取れなかった。画面はモデル名の直接入力に切り替える */
  unavailable: boolean;
  loading: boolean;
}

/**
 * 部屋に指定できるモデルの一覧。管理画面を開いたときに一度だけ引く。
 * サーバー側が数分キャッシュしているので、画面ごとに持ち回す必要はない。
 */
export function useModels(): ModelOptions {
  const [state, setState] = useState<ModelOptions>({
    models: [],
    unavailable: false,
    loading: true,
  });

  useEffect(() => {
    let alive = true;

    void api
      .listModels()
      .then(({ models }) => {
        if (!alive) return;
        setState({ models, unavailable: models.length === 0, loading: false });
      })
      .catch(() => {
        if (!alive) return;
        setState({ models: [], unavailable: true, loading: false });
      });

    return () => {
      alive = false;
    };
  }, []);

  return state;
}
