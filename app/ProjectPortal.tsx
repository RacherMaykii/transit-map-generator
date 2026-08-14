"use client";

import { FormEvent, lazy, Suspense, useEffect, useMemo, useState } from "react";
import { BrowserEditorDocumentStore } from "./projects/editorDocumentStore";
import {
  createProjectRepository,
  DEFAULT_PROJECT_ID,
  type ProjectRepository,
  type ProjectSummary,
  type StorageMode,
} from "./projects/repositories";
import "./portal.css";
import { ABOUT_LINKS, APP_VERSION, BETA_DETAILS, BETA_NOTICE, DISCLAIMER_SECTIONS, FREE_NOTE, NOTES } from "./portalContent";
import { siteUrl } from "./site";

const TransitMapApp = lazy(() => import("./transit/TransitMapApp"));
const EntranceSignApp = lazy(() => import("./entrance/EntranceSignApp"));
const WiringDiagramApp = lazy(() => import("./wiring/WiringDiagramApp"));

type ToolKind = "sign" | "name" | "wiring";
type TransferDialog = "import" | "assets" | "export" | null;
type TransferMode = "full" | "split";

const TOOL_COPY: Record<ToolKind, { label: string; eyebrow: string; title: string; description: string }> = {
  sign: {
    label: "线路站序图生成",
    eyebrow: "ROUTE DIAGRAM",
    title: "线路站序图项目",
    description: "编辑线路、站点、运行方向和换乘信息，预览并导出线路站序图。",
  },
  name: {
    label: "出入口站名标识生成",
    eyebrow: "ENTRANCE SIGN",
    title: "出入口站名标识项目",
    description: "使用同一城市项目中的线路与站点数据，制作并导出入口站名标识。",
  },
  wiring: {
    label: "配线图生成",
    eyebrow: "WIRING DIAGRAM",
    title: "配线图项目",
    description: "使用同一城市项目中的线路与站点数据，绘制轨道结构与站点连接关系。",
  },
};

function ToolSymbol({ kind }: { kind: ToolKind }) {
  if (kind === "sign") {
    return (
      <span className="route-tool-glyph" aria-hidden="true">
        <span className="route-tool-line" />
        <span className="route-tool-node route-tool-node-start" />
        <span className="route-tool-node route-tool-node-middle" />
        <span className="route-tool-node route-tool-node-end" />
      </span>
    );
  }
  if (kind === "name") {
    return (
      <span className="entrance-tool-glyph" aria-hidden="true">
        <span className="entrance-tool-board"><span /><span /></span>
        <span className="entrance-tool-post" />
      </span>
    );
  }
  return (
    <span className="wiring-tool-glyph" aria-hidden="true">
      <span className="wiring-tool-rail wiring-tool-rail-main" />
      <span className="wiring-tool-rail wiring-tool-rail-branch" />
      <span className="wiring-tool-node wiring-tool-node-start" />
      <span className="wiring-tool-node wiring-tool-node-main" />
      <span className="wiring-tool-node wiring-tool-node-branch" />
    </span>
  );
}

function requestedStorageMode(): StorageMode {
  const requested = new URLSearchParams(window.location.search).get("storage");
  return requested === "http" ? "http" : "browser";
}

function displayProject(project: ProjectSummary): ProjectSummary {
  return project.id === DEFAULT_PROJECT_ID ? { ...project, name: "虚空城" } : project;
}

export default function ProjectPortal() {
  const [tool, setTool] = useState<ToolKind>("sign");
  const [repository, setRepository] = useState<ProjectRepository | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [opened, setOpened] = useState<{ tool: ToolKind; project: ProjectSummary } | null>(null);
  const [transferDialog, setTransferDialog] = useState<TransferDialog>(null);
  const [transferMode, setTransferMode] = useState<TransferMode>("full");
  const [projectImportFile, setProjectImportFile] = useState<File | null>(null);
  const [assetImportFile, setAssetImportFile] = useState<File | null>(null);
  const [transferMessage, setTransferMessage] = useState("");
  const [infoDialog, setInfoDialog] = useState<"about" | "notes" | "beta" | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const documentStore = useMemo(() => new BrowserEditorDocumentStore(), []);

  useEffect(() => {
    const mode = requestedStorageMode();
    setRepository(createProjectRepository({
      storageMode: mode,
      host: mode === "http" ? "http://127.0.0.1:4175/api" : undefined,
    }));
  }, []);

  useEffect(() => {
    if (!repository) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      let loaded = await repository.listProjects();
      if (!loaded.length && repository.capabilities.canCreateProjects) {
        await repository.loadTransitData(DEFAULT_PROJECT_ID);
        loaded = await repository.listProjects();
      }
      if (cancelled) return;
      const visible = loaded.map(displayProject);
      setProjects(visible);
      setSelectedId((current) => visible.some((project) => project.id === current) ? current : visible[0]?.id || "");
    })().catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "项目列表读取失败");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [repository]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) || null,
    [projects, selectedId],
  );
  const copy = TOOL_COPY[tool];

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repository || !repository.capabilities.canCreateProjects) return;
    const name = newName.trim();
    if (!name) return;
    setError("");
    try {
      const project = await repository.createProject(name);
      await repository.loadTransitData(project.id);
      setProjects((current) => [...current, project]);
      setSelectedId(project.id);
      setNewName("");
      setCreating(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "项目创建失败");
    }
  }

  function openDeleteDialog() {
    if (!repository || !selectedProject || !repository.capabilities.canDeleteProjects) return;
    if (repository.mode === "http" && selectedProject.id === DEFAULT_PROJECT_ID) {
      setError("默认项目“虚空城”直接使用 data 目录的数据，不能删除。");
      return;
    }
    setDeleteConfirmation("");
    setDeleteDialogOpen(true);
  }

  async function deleteSelectedProject() {
    if (!repository || !selectedProject || deleteConfirmation !== selectedProject.name) return;
    setDeleting(true);
    setError("");
    try {
      await repository.deleteProject(selectedProject.id);
      await documentStore.deleteProjectDocuments(selectedProject.id);
      const remaining = projects.filter((project) => project.id !== selectedProject.id);
      setProjects(remaining);
      setSelectedId(remaining[0]?.id || "");
      setDeleteDialogOpen(false);
      setDeleteConfirmation("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "项目删除失败");
    } finally {
      setDeleting(false);
    }
  }

  function downloadArchive(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function cleanProjectName(name: string) {
    return name.replace(/[\\/:*?"<>|]/g, "_");
  }

  async function exportSelectedProject() {
    if (!repository || !selectedProject) return;
    setTransferring(true);
    setError("");
    try {
      const { createRailAssetsArchive, createRailProjectArchive } = await import("./projects/projectArchive");
      const filename = cleanProjectName(selectedProject.name);
      if (transferMode === "full") {
        downloadArchive(await createRailProjectArchive(selectedProject, repository, "full", documentStore), `${filename}.railcity`);
      } else {
        const [main, assets] = await Promise.all([
          createRailProjectArchive(selectedProject, repository, "project", documentStore),
          createRailAssetsArchive(selectedProject, repository),
        ]);
        downloadArchive(main, `${filename}.railproj`);
        downloadArchive(assets, `${filename}.railassets`);
      }
      setTransferDialog(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "项目导出失败");
    } finally {
      setTransferring(false);
    }
  }

  async function importProject() {
    if (!repository) return;
    const supplementOnly = (transferDialog === "assets" || transferMode === "split") && !projectImportFile && !!assetImportFile && !!selectedProject;
    if (!projectImportFile && !supplementOnly) return;
    setTransferring(true);
    setError("");
    try {
      const { importRailAssetsArchive, importRailProjectArchive } = await import("./projects/projectArchive");
      if (supplementOnly && assetImportFile && selectedProject) {
        const restored = await importRailAssetsArchive(assetImportFile, selectedProject.id, repository);
        setTransferMessage(`已向项目“${selectedProject.name}”补充 ${restored.imported} 个素材${restored.missing.length ? `，仍缺少 ${restored.missing.length} 个` : ""}`);
        setAssetImportFile(null);
        setTransferDialog(null);
        return;
      }
      if (!projectImportFile) return;
      const result = await importRailProjectArchive(projectImportFile, repository, documentStore);
      const project = result.project;
      let assetMessage = result.missingAssets.length ? `；仍缺少 ${result.missingAssets.length} 个素材` : "";
      if (transferMode === "split" && assetImportFile) {
        const restored = await importRailAssetsArchive(assetImportFile, project.id, repository);
        assetMessage = `；资源包恢复 ${restored.imported} 个素材${restored.missing.length ? `，缺少 ${restored.missing.length} 个` : ""}`;
      }
      setProjects((current) => [...current, project]);
      setSelectedId(project.id);
      setTransferMessage(`已导入项目“${project.name}”${assetMessage}`);
      setProjectImportFile(null);
      setAssetImportFile(null);
      setTransferDialog(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "项目导入失败");
    } finally {
      setTransferring(false);
    }
  }

  function openTransferDialog(kind: Exclude<TransferDialog, null>) {
    setTransferMode(kind === "assets" ? "split" : "full");
    setProjectImportFile(null);
    setAssetImportFile(null);
    setTransferMessage("");
    setError("");
    setTransferDialog(kind);
  }

  if (opened && repository) {
    const editorKey = `${opened.project.id}:${opened.tool}`;
    return (
      <div className="project-workspace-shell">
        <div className="project-workspace-bar">
          <button type="button" onClick={() => setOpened(null)} aria-label="返回项目列表">← 返回项目</button>
          <div>
            <span>{TOOL_COPY[opened.tool].label}</span>
            <strong>{opened.project.name}</strong>
          </div>
        </div>
        <Suspense fallback={<main className="loading-shell"><div className="loading-card"><h1>正在打开编辑器…</h1><p>项目数据仍保存在本机。</p></div></main>}>
          {opened.tool === "sign"
            ? <TransitMapApp key={editorKey} projectId={opened.project.id} repository={repository} />
            : opened.tool === "name"
              ? <EntranceSignApp key={editorKey} projectId={opened.project.id} repository={repository} />
              : <WiringDiagramApp key={editorKey} projectId={opened.project.id} repository={repository} />}
        </Suspense>
      </div>
    );
  }

  return (
    <main className="project-portal">
      <div className="portal-image" aria-hidden="true" />
      <div className="portal-gradient" aria-hidden="true" />

      <header className="portal-heading">
        <div className="portal-logo"><img src={siteUrl("assets/rail-transit-icon.png")} alt="轨道交通图标" /></div>
        <div>
          <p>VOID CITY · LOCAL DESIGN WORKSPACE</p>
          <h1>轨道交通视觉设计工坊</h1>
          <span>线路站序图、出入口站名标识、配线图与独立信息组件的本地视觉设计空间</span>
        </div>
      </header>

      <div className="portal-beta-banner" role="note">
        <span aria-hidden="true">⚠️</span>
        <p><strong>本软件为 Beta 版本</strong>，可能存在兼容性问题。</p>
        <button type="button" onClick={() => setInfoDialog("beta")}>查看详情</button>
      </div>

      <section className="portal-panel" aria-label="项目工作台">
        <aside className="portal-tools">
          <div className="portal-tools-heading"><span>工具</span><strong>选择设计类型</strong></div>
          {(Object.keys(TOOL_COPY) as ToolKind[]).map((kind) => {
            const item = TOOL_COPY[kind];
            return (
              <button key={kind} type="button" className={tool === kind ? "is-active" : ""} onClick={() => { setTool(kind); setCreating(false); }} aria-pressed={tool === kind}>
                <i aria-hidden="true"><ToolSymbol kind={kind} /></i>
                <span><strong>{item.label}</strong><small>{item.eyebrow}</small></span>
                <b aria-hidden="true">›</b>
              </button>
            );
          })}
          <div className="portal-tools-note">
            一个城市项目共享线路、站点和换乘数据；三个编辑器分别保存自己的设计内容。
          </div>
        </aside>

        <div className="portal-projects">
          <div className="portal-projects-topline">
            <div><p>{copy.eyebrow}</p><h2>{copy.title}</h2><span>{copy.description}</span></div>
            <div className="portal-project-actions">
              <button type="button" onClick={() => setCreating(true)} disabled={transferring || !repository?.capabilities.canCreateProjects}>＋ 新建项目</button>
              <button type="button" onClick={() => openTransferDialog("import")} disabled={transferring || !repository?.capabilities.canCreateProjects}>导入项目</button>
              <button type="button" onClick={() => openTransferDialog("assets")} disabled={transferring || !selectedProject || !repository?.capabilities.canManageAssets}>导入资源包</button>
              <button type="button" onClick={() => openTransferDialog("export")} disabled={transferring || !selectedProject}>{transferring ? "处理中…" : "导出项目"}</button>
              <button type="button" className="is-danger" onClick={openDeleteDialog} disabled={transferring || deleting || !selectedProject || !repository?.capabilities.canDeleteProjects}>删除</button>
            </div>
          </div>

          {creating && (
            <form className="new-project-form" onSubmit={createProject}>
              <label htmlFor="new-project-name">项目名称</label>
              <input id="new-project-name" autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="例如：第八季线路" />
              <button type="submit" disabled={!newName.trim()}>创建</button>
              <button type="button" onClick={() => { setCreating(false); setNewName(""); }}>取消</button>
            </form>
          )}

          {error && <div className="project-empty" role="alert">{error}</div>}
          {transferMessage && <div className="project-empty" role="status">{transferMessage}</div>}
          <div className="project-list" role="listbox" aria-label={`${copy.label}项目列表`}>
            {projects.map((project) => {
              const selected = selectedProject?.id === project.id;
              return (
                <article key={project.id} className={`project-card ${selected ? "is-selected" : ""}`} onClick={() => setSelectedId(project.id)} role="option" aria-selected={selected} tabIndex={0} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(project.id); }
                }}>
                  <div className="project-card-icon"><ToolSymbol kind={tool} /></div>
                  <div className="project-card-copy"><span>城市项目</span><h3>{project.name}</h3><p>三个编辑器共享该项目的线路、站点与换乘数据</p></div>
                  <button type="button" onClick={(event) => { event.stopPropagation(); setOpened({ tool, project }); }}>打开项目 <b aria-hidden="true">→</b></button>
                </article>
              );
            })}
            {!loading && !projects.length && <div className="project-empty">还没有项目，请点击“新建项目”开始。</div>}
            {loading && <div className="project-empty">正在读取本地项目……</div>}
          </div>

          <div className="portal-projects-footer">
            <span><i /> {repository?.mode === "http" ? "本地文件工作区" : "浏览器本地工作区"}</span>
            <p>{repository?.mode === "http" ? "项目数据按项目保存在 data 目录（新项目在 data/projects/ 下），建议定期导出项目备份。" : "项目保存在此浏览器中，建议定期导出项目备份。"}</p>
          </div>
        </div>
      </section>

      <footer className="portal-legal">
        <span>轨道交通视觉设计工坊 v{APP_VERSION} · 完全免费</span>
        <button type="button" onClick={() => setInfoDialog("about")}>关于 / 关于本项目</button>
        <button type="button" onClick={() => setInfoDialog("notes")}>注意事项与免责声明</button>
      </footer>

      {transferDialog && (
        <div className="portal-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !transferring && setTransferDialog(null)}>
          <section className="portal-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="portal-transfer-title">
            <header>
              <div><span>城市公共工程</span><h2 id="portal-transfer-title">{transferDialog === "import" ? "导入项目" : transferDialog === "assets" ? "导入资源包" : "导出项目"}</h2></div>
              <button type="button" onClick={() => setTransferDialog(null)} disabled={transferring} aria-label="关闭">×</button>
            </header>
            {transferDialog !== "assets" && <div className="portal-transfer-options">
              <label className={transferMode === "full" ? "is-selected" : ""}>
                <input type="radio" name="transfer-mode" checked={transferMode === "full"} onChange={() => { setTransferMode("full"); setAssetImportFile(null); }} />
                <strong>完整工程包 <code>.railcity</code></strong>
                <small>推荐。项目数据、三个编辑器设计及用户上传素材都在一个文件中。</small>
              </label>
              <label className={transferMode === "split" ? "is-selected" : ""}>
                <input type="radio" name="transfer-mode" checked={transferMode === "split"} onChange={() => setTransferMode("split")} />
                <strong>主要工程 + 资源包</strong>
                <small><code>.railproj</code> 保存设计与素材引用，<code>.railassets</code> 保存用户上传素材；缺少资源包时使用占位提示，之后可恢复。</small>
              </label>
            </div>}
            {transferDialog === "assets" ? (
              <div className="portal-transfer-files">
                <label>
                  <span>补充到项目“{selectedProject?.name}”</span>
                  <input type="file" accept=".railassets,application/zip" onChange={(event) => setAssetImportFile(event.target.files?.[0] || null)} />
                </label>
              </div>
            ) : transferDialog === "import" && (
              <div className="portal-transfer-files">
                <label>
                  <span>{transferMode === "full" ? "完整工程文件" : "主要工程文件（新建项目时需要）"}</span>
                  <input type="file" accept={transferMode === "full" ? ".railcity,application/zip" : ".railproj,application/zip"} onChange={(event) => setProjectImportFile(event.target.files?.[0] || null)} />
                </label>
                {transferMode === "split" && <label><span>资源包（可稍后补充）</span><input type="file" accept=".railassets,application/zip" onChange={(event) => setAssetImportFile(event.target.files?.[0] || null)} /></label>}
              </div>
            )}
            <div className="portal-transfer-note">
              {transferDialog === "export"
                ? transferMode === "full" ? "将下载 1 个可独立恢复的完整工程文件。" : "将连续下载主工程和资源包两个文件。"
                : transferDialog === "assets" ? "资源包会按稳定素材引用补充到当前选中的项目，不会新建或覆盖项目数据。"
                : transferMode === "full" ? "导入后会创建一个新项目，不覆盖当前项目。" : "资源包中的素材按稳定引用自动恢复，无需逐个重新选择。"}
            </div>
            <footer>
              <button type="button" onClick={() => setTransferDialog(null)} disabled={transferring}>取消</button>
              <button type="button" className="is-primary" disabled={transferring || (transferDialog === "import" && !projectImportFile && !(transferMode === "split" && assetImportFile && selectedProject)) || (transferDialog === "assets" && (!assetImportFile || !selectedProject))} onClick={() => void (transferDialog === "export" ? exportSelectedProject() : importProject())}>
                {transferring ? "处理中…" : transferDialog === "export" ? "开始导出" : transferDialog === "assets" || (!projectImportFile && assetImportFile) ? "补充到当前项目" : "开始导入"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {deleteDialogOpen && selectedProject && (
        <div className="portal-modal-backdrop portal-delete-backdrop" role="presentation">
          <section className="portal-transfer-modal portal-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="portal-delete-title" aria-describedby="portal-delete-description">
            <header>
              <div><span>最高级别警告</span><h2 id="portal-delete-title">永久删除整个城市工程</h2></div>
              <button type="button" onClick={() => setDeleteDialogOpen(false)} disabled={deleting} aria-label="关闭">×</button>
            </header>
            <div className="portal-delete-body" id="portal-delete-description">
              <p className="portal-delete-lead">这不是只删除当前选中的编辑器。</p>
              <strong>项目“{selectedProject.name}”下的三个编辑器内容将一起永久删除：</strong>
              <ul>
                <li>线路站序图</li>
                <li>出入口站名标识</li>
                <li>配线图</li>
              </ul>
              <p>共享线路、站点、换乘数据和项目素材也会一并删除，且无法撤销。建议先导出完整工程包备份。</p>
              <label htmlFor="delete-project-confirmation">输入项目名称 <b>{selectedProject.name}</b> 以确认</label>
              <input id="delete-project-confirmation" autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} disabled={deleting} autoComplete="off" />
            </div>
            <footer>
              <button type="button" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>取消</button>
              <button type="button" className="is-destructive" disabled={deleting || deleteConfirmation !== selectedProject.name} onClick={() => void deleteSelectedProject()}>
                {deleting ? "正在删除…" : "永久删除三个编辑器内容"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {infoDialog === "about" && (
        <div className="portal-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setInfoDialog(null)}>
          <section className="portal-info-modal" role="dialog" aria-modal="true" aria-labelledby="portal-about-title">
            <header>
              <div><span>关于</span><h2 id="portal-about-title">关于本项目</h2></div>
              <button type="button" onClick={() => setInfoDialog(null)} aria-label="关闭">×</button>
            </header>
            <div className="portal-info-body">
              <p className="portal-free-note">🆓 {FREE_NOTE}</p>
              <h3>关注与支持</h3>
              <div className="portal-link-list">
                {ABOUT_LINKS.map((link) => link.url ? (
                  <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer">
                    <strong>{link.label}</strong><small>{link.sublabel}</small>
                  </a>
                ) : (
                  <div key={link.label} className="portal-link-note">
                    <strong>{link.label}</strong><small>{link.sublabel}</small>
                  </div>
                ))}
              </div>
              <p className="portal-version">当前版本 v{APP_VERSION}</p>
            </div>
            <footer><button type="button" className="is-primary" onClick={() => setInfoDialog(null)}>知道了</button></footer>
          </section>
        </div>
      )}

      {infoDialog === "notes" && (
        <div className="portal-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setInfoDialog(null)}>
          <section className="portal-info-modal" role="dialog" aria-modal="true" aria-labelledby="portal-notes-title">
            <header>
              <div><span>使用须知</span><h2 id="portal-notes-title">注意事项与免责声明</h2></div>
              <button type="button" onClick={() => setInfoDialog(null)} aria-label="关闭">×</button>
            </header>
            <div className="portal-info-body">
              <h3>注意事项</h3>
              <ul className="portal-notes-list">
                {NOTES.map((note) => <li key={note}>{note}</li>)}
              </ul>
              <h3>免责声明</h3>
              {DISCLAIMER_SECTIONS.map((section) => (
                <div key={section.title} className="portal-disclaimer-section">
                  <h4>{section.title}</h4>
                  <p>{section.body}</p>
                </div>
              ))}
            </div>
            <footer><button type="button" className="is-primary" onClick={() => setInfoDialog(null)}>知道了</button></footer>
          </section>
        </div>
      )}

      {infoDialog === "beta" && (
        <div className="portal-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setInfoDialog(null)}>
          <section className="portal-info-modal" role="dialog" aria-modal="true" aria-labelledby="portal-beta-title">
            <header>
              <div><span>Beta 版本</span><h2 id="portal-beta-title">Beta 版本与兼容性</h2></div>
              <button type="button" onClick={() => setInfoDialog(null)} aria-label="关闭">×</button>
            </header>
            <div className="portal-info-body">
              <p className="portal-beta-alert">⚠️ {BETA_NOTICE}</p>
              {BETA_DETAILS.map((section) => (
                <div key={section.title} className="portal-disclaimer-section">
                  <h4>{section.title}</h4>
                  <p>{section.body}</p>
                </div>
              ))}
            </div>
            <footer><button type="button" className="is-primary" onClick={() => setInfoDialog(null)}>知道了</button></footer>
          </section>
        </div>
      )}
    </main>
  );
}
