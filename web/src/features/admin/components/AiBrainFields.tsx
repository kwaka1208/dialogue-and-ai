import type { AiMode } from '../../room/types.ts';
import type { AiModeDefaults } from '../types.ts';
import type { ModelOptions } from '../hooks/useModels.ts';

interface AiBrainFieldsProps {
  /** いま編集しているモード。文言の出し分けにだけ使う */
  mode: AiMode;
  /** このモードで上書きしなかったときに使われる中身 */
  defaults: AiModeDefaults;
  options: ModelOptions;
  /** 空文字は「既定のまま」を表す */
  model: string;
  onModelChange: (value: string) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
}

const MODE_LABEL: Record<AiMode, string> = {
  chat: '会話モード',
  opinion: '意見モード',
};

/**
 * 部屋ごとのAIの中身（モデルと system prompt）。
 * 部屋を作るときと、あとから設定を変えるときの両方で同じものを使う。
 *
 * どちらも空文字が「既定のまま」を意味する。サーバー側で null に直して保存する。
 */
export function AiBrainFields({
  mode,
  defaults,
  options,
  model,
  onModelChange,
  prompt,
  onPromptChange,
}: AiBrainFieldsProps) {
  const defaultModelText = defaults.model ?? '未設定（このままでは AI が動きません）';
  // 一覧に無いモデルが部屋に入っていることがある（.env を直した、モデルが廃止された、など）
  const choices =
    model !== '' && !options.models.includes(model) ? [model, ...options.models] : options.models;

  return (
    <>
      <label className="field">
        <span className="field-label">{MODE_LABEL[mode]}のモデル</span>
        {options.unavailable ? (
          <input
            className="field-input"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            maxLength={200}
            placeholder={defaultModelText}
          />
        ) : (
          <select
            className="field-input"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={options.loading}
          >
            <option value="">既定のまま（{defaultModelText}）</option>
            {choices.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )}
        <span className="field-hint">
          {options.loading
            ? 'モデルの一覧を読み込んでいます…'
            : options.unavailable
              ? 'モデルの一覧を取れませんでした。モデル名を直接入力できます。空欄なら既定のモデルを使います。'
              : '空欄のままなら .env の設定を使います。'}
        </span>
      </label>

      <label className="field">
        <span className="field-label">{MODE_LABEL[mode]}の system prompt</span>
        <textarea
          className="field-input"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          maxLength={4000}
          rows={prompt === '' ? 3 : 14}
          placeholder="空欄のままなら、この下のボタンで読み込める既定のプロンプトを使います"
        />
        <span className="field-hint">
          {prompt === ''
            ? '既定のプロンプトを使います。'
            : `この部屋だけのプロンプトを使います（${prompt.length} / 4000 文字）。`}
        </span>
      </label>

      <div className="admin-actions">
        <button
          className="text-button"
          type="button"
          onClick={() => onPromptChange(defaults.systemPrompt)}
        >
          既定を読み込んで編集する
        </button>
        {prompt !== '' && (
          <button className="text-button" type="button" onClick={() => onPromptChange('')}>
            既定に戻す
          </button>
        )}
      </div>
    </>
  );
}
