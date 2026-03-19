import React, { useEffect, useMemo, useState } from 'react';

function normalizeUrl(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return 'https://example.com';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+\.[\w.-]+/.test(trimmed)) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export default function App() {
  const [urlInput, setUrlInput] = useState('https://example.com');
  const [currentUrl, setCurrentUrl] = useState('https://example.com');
  const [scripts, setScripts] = useState([]);
  const [perm, setPerm] = useState({}); // host -> { alwaysAllow: boolean }
  const [adblock, setAdblock] = useState({ enabled: true });
  const [cosmetic, setCosmetic] = useState({ enabled: true, css: '' });
  const [privacy, setPrivacy] = useState({
    blockPopups: true,
    blockNotifications: true,
    doNotTrack: true,
    stripReferer: true,
    blockThirdPartyCookies: true
  });
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [newScript, setNewScript] = useState({
    name: 'Auto Scroll Demo',
    match: '*://*/*',
    runAt: 'dom-ready',
    enabled: true,
    code:
      "(() => {\n  // demo: auto scroll\n  const step = 250;\n  setInterval(() => {\n    window.scrollBy(0, step);\n  }, 1200);\n})();\n"
  });

  const [pending, setPending] = useState(null); // { requestId, url, host, matchedScripts }

  const host = useMemo(() => hostFromUrl(currentUrl), [currentUrl]);

  useEffect(() => {
    const api = window.browserIsApi;
    if (!api) return;

    api.getState().then(({ lastUrl, scripts: s, permissions, privacy: p, cosmetic: c }) => {
      setScripts(s);
      setPerm(permissions);
      if (p) setPrivacy(p);
      if (c) setCosmetic(c);
      if (lastUrl) {
        setCurrentUrl(lastUrl);
        setUrlInput(lastUrl);
      }
    });
    api.getState().then(({ adblock: a }) => {
      if (a) setAdblock(a);
    });

    const off1 = api.onScriptsChanged((s) => setScripts(s));
    const off2 = api.onPermissionsChanged((p) => setPerm(p));
    const off2b = api.onAdblockChanged((a) => setAdblock(a));
    const off2bb = api.onCosmeticChanged((c) => setCosmetic(c));
    const off2c = api.onPrivacyChanged((p) => setPrivacy(p));
    const off3 = api.onScriptRunRequest(({ requestId, url, host: h, matchedScripts }) => {
      setPending({ requestId, url, host: h, matchedScripts });
    });
    const off4 = api.onNavigation(({ url }) => setCurrentUrl(url));
    const off4b = api.onNavigation(({ url }) => setUrlInput(url));

    return () => {
      off1?.();
      off2?.();
      off2b?.();
      off2bb?.();
      off2c?.();
      off3?.();
      off4?.();
      off4b?.();
    };
  }, []);

  async function go() {
    const next = normalizeUrl(urlInput);
    setCurrentUrl(next);
    await window.browserIsApi?.navigate(next);
  }

  async function saveNewScript() {
    const api = window.browserIsApi;
    if (!api) return;
    await api.upsertScript(newScript);
    setScriptModalOpen(false);
  }

  async function removeScript(id) {
    await window.browserIsApi?.removeScript(id);
  }

  async function toggleScript(id, enabled) {
    await window.browserIsApi?.setScriptEnabled(id, enabled);
  }

  async function decision(allow, always) {
    const api = window.browserIsApi;
    if (!api || !pending) return;
    await api.sendScriptRunDecision({ requestId: pending.requestId, allow, always });
    setPending(null);
  }

  return (
    <div className="app">
      <div className="toolbar">
        <button className="btn" onClick={() => window.browserIsApi?.goBack()}>
          ←
        </button>
        <input
          className="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go();
          }}
          spellCheck={false}
        />
        <button className="btn primary" onClick={go}>
          前往
        </button>
        <button className="btn" onClick={() => window.browserIsApi?.reload()} title="刷新当前页面">
          刷新
        </button>
        <button
          className={`btn ${adblock?.enabled ? 'primary' : ''}`}
          onClick={async () => {
            const next = !adblock?.enabled;
            setAdblock({ enabled: next });
            await window.browserIsApi?.setAdblockEnabled(next);
          }}
          title="广告拦截（网络层）"
        >
          AdBlock: {adblock?.enabled ? '开' : '关'}
        </button>
        <button
          className={`btn ${cosmetic?.enabled ? 'primary' : ''}`}
          onClick={async () => {
            const next = !cosmetic?.enabled;
            setCosmetic({ ...cosmetic, enabled: next });
            await window.browserIsApi?.setCosmetic({ enabled: next });
          }}
          title="隐藏广告容器（CSS 注入）"
        >
          HideAds: {cosmetic?.enabled ? '开' : '关'}
        </button>
        <button className="btn" onClick={() => setScriptModalOpen(true)}>
          脚本
        </button>
        <button className="btn" onClick={() => setPrivacyOpen(true)}>
          隐私
        </button>
      </div>

      <div className="content">
        <div className="hint">
          当前站点：<b>{host || '—'}</b>　
          {perm?.[host]?.alwaysAllow ? (
            <span className="pill">已设置：总是允许</span>
          ) : (
            <span className="pill">每次运行前询问</span>
          )}
          <div className="small">说明：脚本保存在本机本地；匹配到脚本时会先弹窗拦截，点“允许”才会注入执行。</div>
        </div>

        {scriptModalOpen && (
          <div className="modalBackdrop" role="dialog" aria-modal="true">
            <div className="modal">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>脚本管理</div>
                  <div className="small">类似 Tampermonkey：按 URL 匹配并注入执行。</div>
                </div>
                <button className="btn" onClick={() => setScriptModalOpen(false)}>
                  关闭
                </button>
              </div>

              <div style={{ height: 12 }} />

              <div className="row">
                <div className="field">
                  <label>脚本名</label>
                  <input value={newScript.name} onChange={(e) => setNewScript({ ...newScript, name: e.target.value })} />
                </div>
                <div className="field">
                  <label>匹配（简化版）</label>
                  <input
                    value={newScript.match}
                    onChange={(e) => setNewScript({ ...newScript, match: e.target.value })}
                    placeholder="例如：*://*.youtube.com/*"
                    spellCheck={false}
                  />
                </div>
              </div>

              <div style={{ height: 10 }} />

              <div className="row">
                <div className="field">
                  <label>注入时机</label>
                  <select value={newScript.runAt} onChange={(e) => setNewScript({ ...newScript, runAt: e.target.value })}>
                    <option value="dom-ready">dom-ready</option>
                    <option value="did-finish-load">did-finish-load</option>
                  </select>
                </div>
                <div className="field">
                  <label>启用</label>
                  <div style={{ padding: '10px 0' }}>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={newScript.enabled}
                        onChange={(e) => setNewScript({ ...newScript, enabled: e.target.checked })}
                      />
                      启用此脚本
                    </label>
                  </div>
                </div>
              </div>

              <div className="field">
                <label>脚本内容（JS）</label>
                <textarea value={newScript.code} onChange={(e) => setNewScript({ ...newScript, code: e.target.value })} />
              </div>

              <div style={{ height: 10 }} />
              <div className="actions">
                <button className="btn primary" onClick={saveNewScript}>
                  保存脚本
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    setNewScript({
                      name: 'Auto Click Demo',
                      match: '*://*/*',
                      runAt: 'dom-ready',
                      enabled: true,
                      code:
                        "(() => {\n  // demo: click the first button repeatedly\n  const click = () => {\n    const btn = document.querySelector('button, [role=\"button\"], input[type=\"button\"], input[type=\"submit\"]');\n    if (btn) btn.click();\n  };\n  setInterval(click, 2000);\n})();\n"
                    })
                  }
                >
                  填充示例：自动点击
                </button>
              </div>

              <div style={{ height: 14 }} />
              <div style={{ fontWeight: 700, marginBottom: 6 }}>已有脚本</div>
              <div className="list">
                {scripts.length === 0 && <div className="small">暂无脚本。先保存一个试试。</div>}
                {scripts.map((s) => (
                  <div className="item" key={s.id}>
                    <div className="itemTop">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700 }}>{s.name}</div>
                        <span className="pill">{s.match}</span>
                        <span className="pill">{s.runAt}</span>
                      </div>
                      <div className="actions">
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={!!s.enabled}
                            onChange={(e) => toggleScript(s.id, e.target.checked)}
                          />
                          启用
                        </label>
                        <button className="btn danger" onClick={() => removeScript(s.id)}>
                          删除
                        </button>
                      </div>
                    </div>
                    <div className="small">id：{s.id}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {privacyOpen && (
          <div className="modalBackdrop" role="dialog" aria-modal="true">
            <div className="modal">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>隐私与安全（反劫持 / 反追踪）</div>
                  <div className="small">默认开启；包含“隐藏广告元素”的自定义 CSS。</div>
                </div>
                <button className="btn" onClick={() => setPrivacyOpen(false)}>
                  关闭
                </button>
              </div>

              <div style={{ height: 12 }} />

              {[
                ['blockPopups', '阻止弹窗/新窗口（反劫持）'],
                ['blockNotifications', '阻止通知权限（反追踪）'],
                ['doNotTrack', '发送 DNT / GPC（反追踪）'],
                ['stripReferer', '去掉 Referer（减少跨站追踪）'],
                ['blockThirdPartyCookies', '阻止第三方 Set-Cookie（减少跟踪）']
              ].map(([k, label]) => (
                <label key={k} className="toggle" style={{ display: 'flex', padding: '8px 0' }}>
                  <input
                    type="checkbox"
                    checked={!!privacy?.[k]}
                    onChange={async (e) => {
                      const next = { ...privacy, [k]: e.target.checked };
                      setPrivacy(next);
                      await window.browserIsApi?.setPrivacy({ [k]: e.target.checked });
                    }}
                  />
                  {label}
                </label>
              ))}

              <div style={{ height: 12 }} />
              <div className="field">
                <label>隐藏广告元素：自定义 CSS（可选）</label>
                <textarea
                  value={cosmetic?.css || ''}
                  onChange={(e) => setCosmetic({ ...cosmetic, css: e.target.value })}
                  placeholder={"例如：\n#banner-ad, .sponsored { display:none !important; }\n"}
                />
              </div>
              <div className="actions" style={{ marginTop: 10 }}>
                <button
                  className="btn primary"
                  onClick={async () => {
                    await window.browserIsApi?.setCosmetic({ css: cosmetic?.css || '' });
                  }}
                >
                  应用 CSS
                </button>
              </div>

              <div style={{ height: 10 }} />
              <div className="small">提示：如果你只拦请求但页面还留空白位，就用 CSS 把广告容器隐藏掉。</div>
            </div>
          </div>
        )}

        {pending && (
          <div className="modalBackdrop" role="dialog" aria-modal="true">
            <div className="modal">
              <div style={{ fontSize: 16, fontWeight: 800 }}>此网站请求运行脚本</div>
              <div className="small" style={{ marginTop: 6 }}>
                站点：<b>{pending.host}</b>
                <div className="small">URL：{pending.url}</div>
              </div>

              <div style={{ height: 10 }} />
              <div style={{ fontWeight: 700, marginBottom: 6 }}>将要运行的脚本</div>
              <div className="list">
                {pending.matchedScripts.map((s) => (
                  <div className="item" key={s.id}>
                    <div className="itemTop">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700 }}>{s.name}</div>
                        <span className="pill">{s.match}</span>
                        <span className="pill">{s.runAt}</span>
                      </div>
                      <span className="pill">已启用</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ height: 12 }} />
              <div className="small dangerText">
                安全提示：脚本可读取/修改网页内容。建议只对信任站点选择“总是允许”。
              </div>

              <div style={{ height: 12 }} />
              <div className="actions">
                <button className="btn primary" onClick={() => decision(true, false)}>
                  允许一次
                </button>
                <button className="btn primary" onClick={() => decision(true, true)}>
                  总是允许此站点
                </button>
                <button className="btn danger" onClick={() => decision(false, false)}>
                  阻止
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

