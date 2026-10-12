import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDownToLine, ArrowRight, BadgeCheck, Check, CheckCircle2, ChevronDown, ClipboardCheck,
  Cloud, FileImage, FileText, ImagePlus, LoaderCircle, LockKeyhole, PackageCheck, Plus, ShieldCheck,
  Sparkles, TriangleAlert, X,
} from 'lucide-react';
import './styles.css';
import { parseCsv } from './packingCsv';
import type { Item } from './types';
import { analyzeCase, exportCase, getMode, loadSampleCase, loadSyntheticLiveImage, type CaseData, type ExportResponse, type ModeInfo, type Review } from './transport';
import type { Observation } from '../shared/domain';

const blankItems = (): Item[] => [
  { id: 'line-1', sku: '', name: '', expectedQuantity: 0 },
  { id: 'line-2', sku: '', name: '', expectedQuantity: 0 },
  { id: 'line-3', sku: '', name: '', expectedQuantity: 0 },
];

function App() {
  const [mode, setMode] = useState<ModeInfo | null>(null);
  const [items, setItems] = useState<Item[]>(blankItems());
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [file, setFile] = useState<File | null>(null);
  const [csv, setCsv] = useState('SKU,Name,Quantity\nMUG-12-OAT,Stoneware mug - oat,24');
  const [busy, setBusy] = useState<'sample' | 'analyze' | 'export' | null>(null);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ExportResponse | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [syntheticDemoInput, setSyntheticDemoInput] = useState(false);

  useEffect(() => {
    getMode().then(setMode).catch((caught) => setMode({ mode: 'demo_fixture', ready: false, model: null, location: null, error: errorMessage(caught) }));
  }, []);

  const fixtureCase = caseData?.mode === 'demo_fixture';
  const isFixture = caseData ? fixtureCase : (mode?.mode ?? 'demo_fixture') === 'demo_fixture';
  const providerLabel = mode?.mode === 'live_gemini_api' ? 'Gemini Developer API' : mode?.mode === 'firebase_ai_logic' ? 'Firebase AI Logic' : 'Vertex AI';
  const readyCount = caseData ? Object.values(reviews).filter((review) => review.confirmed && isWholeCount(review.quantity)).length : 0;
  const allReviewed = Boolean(caseData && readyCount === items.length && items.length > 0);

  function changeItem(id: string, field: keyof Item, value: string) {
    const next = items.map((item) => item.id !== id ? item : {
      ...item,
      [field]: field === 'expectedQuantity' ? (value === '' ? 0 : Number(value)) : value,
    });
    setItems(next);
    if (caseData) {
      setCaseData(null);
      setReviews({});
      setReport(null);
      setError('Packing list changed. Reload the sample or analyze a new image before approving this case.');
    }
  }

  function addItem() {
    const id = `line-${Date.now()}`;
    setItems([...items, { id, sku: '', name: '', expectedQuantity: 0 }]);
    if (caseData) { setCaseData(null); setReviews({}); setReport(null); }
  }

  function removeItem(id: string) {
    setItems(items.filter((item) => item.id !== id));
    if (caseData) { setCaseData(null); setReviews({}); setReport(null); }
  }

  async function loadSample() {
    setError(''); setReport(null); setBusy('sample');
    try {
      const loadedCase = await loadSampleCase();
      const loadedItems: Item[] = loadedCase.items ?? items;
      setItems(loadedItems); setCaseData(loadedCase); setFile(null); setSyntheticDemoInput(false); setReviews({});
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(null); }
  }

  async function prepareSyntheticLiveImage() {
    setError(''); setReport(null);
    try {
      const synthetic = await loadSyntheticLiveImage();
      setItems(synthetic.items); setFile(synthetic.file); setSyntheticDemoInput(true); setCaseData(null); setReviews({});
    } catch (caught) { setError(errorMessage(caught)); }
  }

  function loadFile(nextFile?: File) {
    if (!nextFile) return;
    const accepted = ['image/jpeg', 'image/png', 'image/webp'];
    if (!accepted.includes(nextFile.type)) { setError('Choose a JPG, PNG, or WebP delivery photo.'); return; }
    if (nextFile.size > 8 * 1024 * 1024) { setError('This image is over 8 MB. Choose a smaller photo.'); return; }
    setFile(nextFile); setSyntheticDemoInput(false); setError(''); setCaseData(null); setReviews({}); setReport(null);
  }

  async function importCsv() {
    try {
      const imported = parseCsv(csv);
      setItems(imported); setCaseData(null); setReviews({}); setReport(null); setError('');
    } catch (caught) { setError(errorMessage(caught)); }
  }

  async function analyzeUpload() {
    if (!file) { setError('Choose a delivery image first.'); return; }
    if (!mode?.ready || !['live_vertex', 'live_gemini_api', 'firebase_ai_logic'].includes(mode.mode)) {
      setError(mode?.error ?? (mode?.mode === 'firebase_ai_logic' ? 'Firebase AI Logic and App Check are not ready. Complete the Firebase setup before analyzing this photo.' : 'This app is in clearly labeled demo fixture mode. New uploads are not sent to Gemini. Configure a live Gemini provider to analyze this photo, or load the illustrated sample case.'));
      return;
    }
    if (!items.length || items.some((item) => !item.sku.trim() || !item.name.trim() || !Number.isInteger(item.expectedQuantity) || item.expectedQuantity < 0)) {
      setError('Complete each packing list SKU, item name, and whole number quantity before analysis.'); return;
    }
    const normalizedSkus = items.map((item) => item.sku.trim().toLocaleUpperCase());
    if (new Set(normalizedSkus).size !== normalizedSkus.length) { setError('Each packing list line needs a unique SKU.'); return; }
    if (new Set(items.map((item) => item.id)).size !== items.length) { setError('Packing line IDs must be unique.'); return; }
    setBusy('analyze'); setError(''); setReport(null);
    try {
      const data = await analyzeCase(file, items, syntheticDemoInput);
      setCaseData(data); setReviews({});
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(null); }
  }

  function updateReview(id: string, field: keyof Review, value: string | boolean) {
    setReviews((previous) => {
      const current = previous[id] ?? { quantity: '', confirmed: false, note: '' };
      return { ...previous, [id]: { ...current, [field]: value } };
    });
    setReport(null);
  }

  async function exportPacket() {
    if (!caseData || !allReviewed) return;
    setBusy('export'); setError('');
    try {
      const data: ExportResponse = await exportCase(caseData, items, reviews);
      if (data.status === 'blocked') throw new Error(data.error ?? 'Confirm every line before exporting.');
      setReport(data);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(null); }
  }

  const observations = useMemo(() => new Map((caseData?.observations ?? []).map((entry) => [entry.itemId, entry])), [caseData]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PackProof home"><span className="brand-mark"><PackageCheck size={20} strokeWidth={2.2} /></span><span>packproof</span><span className="brand-divider"/><span className="brand-sub">RECEIVING DESK</span></a>
        <nav className="top-links"><a className="current" href="#case">Workspace</a><a href="#guide">How it works</a></nav>
        <div className="top-right"><span className="workspace-label"><span className="workspace-dot"/> BROWSER SESSION</span><button className="avatar" aria-label="Somesh">S</button></div>
      </header>

      <main id="top" className="page-wrap">
        <div className="crumb"><span>OPERATIONS</span><span className="crumb-slash">/</span><span>INBOUND</span><span className="crumb-slash">/</span><b>RECEIVING REVIEW</b></div>
        <section className="page-heading">
          <div><div className="eyebrow"><span className="eyebrow-line"/> PROOF BEFORE CLAIMS</div><h1>Good receiving<br className="mobile-break"/> starts with <em>good evidence.</em></h1><p className="subhead">Match what arrived to what was promised. Every count stays in your hands.</p></div>
          <div className="heading-actions"><button className="button button-dark" onClick={loadSample} disabled={busy !== null}><Sparkles size={16}/>{busy === 'sample' ? 'Loading sample…' : 'Open sample case'}<ArrowRight size={15}/></button><div className="sample-caption">A fixed example · not AI inference</div></div>
        </section>

        <section className="mode-banner" aria-live="polite">
          <div className={`mode-icon ${isFixture ? 'fixture' : 'live'}`}>{isFixture ? <ShieldCheck size={17}/> : <Cloud size={17}/>}</div>
          <div className="mode-copy"><strong>{mode?.error ? 'Service connection unavailable' : fixtureCase ? 'Fixed sample case' : isFixture ? 'Demo fixture mode' : !mode?.ready ? 'Configuration needed' : `Live ${providerLabel} mode`}</strong><span>{mode?.error ? mode.error : fixtureCase ? `This case uses fixed sample observations, not AI inference.${mode?.mode !== 'demo_fixture' ? ` New uploads can use ${providerLabel}.` : ''}` : isFixture ? 'The sample is a fixed example, not AI inference. New uploads stay on this device.' : mode?.mode === 'firebase_ai_logic' ? mode.ready ? `Gemini runs through Firebase AI Logic${mode.model ? ` · ${mode.model}` : ''}. The image is sent for this request and not stored by PackProof. Use synthetic, non-sensitive demo photos; free Gemini inputs may be used by Google to improve products.` : 'Firebase AI Logic and App Check are not configured. Live photo analysis is disabled.' : `Gemini runs server-side${mode?.model ? ` · ${mode.model}` : ''}. Your image is not saved.`}</span></div>
          <span className={`mode-pill ${isFixture ? 'pill-demo' : 'pill-live'}`}><i/>{fixtureCase ? 'FIXED SAMPLE' : isFixture ? 'DEMO FIXTURE' : mode?.ready ? mode.mode === 'firebase_ai_logic' ? 'FIREBASE AI LIVE' : `${mode.mode === 'live_gemini_api' ? 'GEMINI API' : 'VERTEX AI'} LIVE` : 'CONFIGURATION NEEDED'}</span>
        </section>

        {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span><button aria-label="Dismiss" onClick={() => setError('')}><X size={16}/></button></div>}

        <section id="case" className="workbench">
          <div className="workbench-head"><div><div className="section-kicker">RECEIVING CASE</div><h2>{caseData ? caseData.caseId : 'Start a new review'}</h2></div><div className="case-actions"><span className={`case-status ${caseData ? 'status-open' : 'status-draft'}`}><i/>{caseData ? 'IN REVIEW' : 'DRAFT'}</span>{caseData && <button className="text-button" onClick={() => { setCaseData(null); setReviews({}); setReport(null); setFile(null); }}>New case</button>}</div></div>

          {!caseData && <div className="setup-grid">
            <div className="setup-panel">
              <div className="panel-heading"><div className="number-badge">01</div><div><h3>Expected shipment</h3><p>Enter rows by hand or paste a packing list.</p></div></div>
              <div className="item-table-wrap"><table className="item-table"><thead><tr><th>SKU</th><th>ITEM DESCRIPTION</th><th>EXPECTED</th><th/></tr></thead><tbody>{items.map((item, index) => <tr key={item.id}><td><input aria-label={`SKU row ${index + 1}`} value={item.sku} placeholder="SKU-000" onChange={(event) => changeItem(item.id, 'sku', event.target.value)}/></td><td><input aria-label={`Item name row ${index + 1}`} value={item.name} placeholder="Item name" onChange={(event) => changeItem(item.id, 'name', event.target.value)}/></td><td><input className="quantity-input" aria-label={`Expected quantity row ${index + 1}`} value={item.expectedQuantity || ''} placeholder="0" type="number" min="0" step="1" onChange={(event) => changeItem(item.id, 'expectedQuantity', event.target.value)}/></td><td><button className="icon-button remove-row" aria-label="Remove row" onClick={() => removeItem(item.id)}><X size={15}/></button></td></tr>)}</tbody></table></div>
              <div className="table-footer"><button className="text-button" onClick={addItem}><Plus size={15}/> Add line</button><button className="text-button" onClick={() => setShowCsv(!showCsv)}><ClipboardCheck size={15}/> Paste CSV <ChevronDown className={showCsv ? 'chevron-up' : ''} size={14}/></button></div>
              {showCsv && <div className="csv-panel"><label htmlFor="csv-input">Paste columns named SKU, Name, Quantity</label><textarea id="csv-input" rows={4} value={csv} onChange={(event) => setCsv(event.target.value)}/><button className="button button-outline button-small" onClick={importCsv}>Import packing list</button></div>}
            </div>
            <div className="setup-panel evidence-setup">
              <div className="panel-heading"><div className="number-badge">02</div><div><h3>Delivery evidence</h3><p>One clear photo from the receiving desk.</p></div></div>
              <label className={`dropzone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }}>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => loadFile(event.target.files?.[0])}/>
                {file ? <><div className="drop-icon"><FileImage size={22}/></div><strong>{file.name}</strong><span>{formatBytes(file.size)} · ready to inspect</span><small>Click to replace photo</small></> : <><div className="drop-icon"><ImagePlus size={22}/></div><strong>Drop a delivery photo here</strong><span>or <u>browse files</u></span><small>JPG, PNG, or WebP · up to 8 MB</small></>}
              </label>
              {mode?.mode === 'firebase_ai_logic' && <><button className="text-button synthetic-image-button" type="button" onClick={prepareSyntheticLiveImage} disabled={busy !== null}><Sparkles size={14}/> Use synthetic illustration for a live AI test</button><small className="synthetic-caption">Loads the sample list and PNG. The Analyze button then makes a real Gemini request.</small></>}
              <div className="privacy-note"><LockKeyhole size={14}/><span>{mode?.mode === 'firebase_ai_logic' ? 'Use synthetic, non-sensitive demo images. Free Gemini inputs may be used by Google to improve products.' : 'Images are processed in memory and not stored.'}</span></div>
              <button className="button button-primary analyze-button" onClick={analyzeUpload} disabled={busy !== null || !file || !mode?.ready || items.length === 0}>{busy === 'analyze' ? <><LoaderCircle size={16} className="spin"/> Inspecting image…</> : <><Sparkles size={16}/> {error ? 'Retry with Gemini' : 'Analyze with Gemini'} <ArrowRight size={15}/></>}</button>
              {mode?.mode === 'demo_fixture' && <div className="setup-mode-note">Demo mode can load the sample case. Configure a live Gemini provider to analyze new uploads.</div>}
            </div>
          </div>}

          {caseData && <>
            <div className="case-meta"><span><FileImage size={14}/>{caseData.imageName}</span><span><span className="meta-dot"/> Generated {new Date(caseData.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span><span className="meta-mode">{caseData.mode === 'demo_fixture' ? 'DETERMINISTIC FIXTURE' : `${caseData.model} · ${caseData.source}`}</span></div>
            <div className="review-grid">
              <div className="evidence-card">
                <div className="card-title"><div><div className="section-kicker">01 / PHOTO EVIDENCE</div><h3>Delivery photo</h3></div><button className="icon-button" title="Open original image" onClick={() => window.open(caseData.mode === 'demo_fixture' ? '/receiving-sample.svg' : URL.createObjectURL(file!), '_blank')}><ArrowDownToLine size={16}/></button></div>
                <div className="photo-frame">{caseData.mode === 'demo_fixture' ? <img src="/receiving-sample.svg" alt="Illustrated sample receiving scene with one open mug carton and two sealed cartons"/> : file ? <img src={URL.createObjectURL(file)} alt="Uploaded delivery evidence"/> : <div className="missing-photo"><FileImage size={24}/>Original photo is unavailable in this session.</div>}<div className="photo-chip"><span/> {caseData.mode === 'demo_fixture' ? 'ILLUSTRATED SAMPLE' : 'UPLOADED EVIDENCE'}</div></div>
                <div className="summary-box"><div className="summary-label"><Sparkles size={14}/> {caseData.mode === 'demo_fixture' ? 'SAMPLE IMAGE SUMMARY' : 'IMAGE SUMMARY'}</div><p>{caseData.imageSummary}</p></div>
                <div className="hash-line"><span>SHA-256</span><code>{caseData.imageSha256}</code></div>
              </div>

              <div className="review-card">
                <div className="card-title"><div><div className="section-kicker">02 / OPERATOR REVIEW</div><h3>Check every line</h3></div><span className="review-counter"><Check size={13}/>{readyCount} / {items.length} reviewed</span></div>
                <div className="review-intro"><ShieldCheck size={17}/><span>{caseData.mode === 'demo_fixture' ? 'These are fixed sample observations, not AI inference.' : 'Gemini suggests visible evidence and counts.'} <strong>You own the final count.</strong> Partial views can’t establish a shortage.</span></div>
                <div className="review-lines">{items.map((item, index) => {
                  const observation = observations.get(item.id);
                  const review = reviews[item.id] ?? { quantity: observation?.visibility === 'complete' && observation.observedQuantity !== null ? String(observation.observedQuantity) : observation?.observedQuantity !== null && observation?.observedQuantity !== undefined ? String(observation.observedQuantity) : '', confirmed: false, note: '' };
                  const variance = observation?.visibility === 'complete' && observation.observedQuantity !== null ? observation.observedQuantity - item.expectedQuantity : null;
                  return <article className={`review-line ${review.confirmed ? 'reviewed' : ''}`} key={item.id}>
                    <div className="line-top"><span className="line-index">{String(index + 1).padStart(2, '0')}</span><div className="line-name"><strong>{item.name}</strong><span>{item.sku}</span></div><span className={`visibility visibility-${observation?.visibility ?? 'unknown'}`}>{visibilityLabel(observation?.visibility)}</span></div>
                    <div className="count-row"><div className="expected-block"><span>EXPECTED</span><strong>{item.expectedQuantity}<small> units</small></strong></div><div className="count-arrow"><ArrowRight size={16}/></div><label className="confirmed-count"><span>YOUR COUNT</span><div><input aria-label={`Confirmed quantity for ${item.sku}`} type="number" min="0" step="1" placeholder="—" value={review.quantity} onChange={(event) => updateReview(item.id, 'quantity', event.target.value)}/><small>units</small></div></label><div className="candidate-block"><span>{caseData.mode === 'demo_fixture' ? 'SAMPLE OBSERVATION' : 'AI SUGGESTION'}</span><strong>{observation?.observedQuantity ?? '—'}<small> {observation?.observedQuantity === null || observation?.observedQuantity === undefined ? '' : 'units'}</small></strong></div></div>
                    {variance !== null && <div className={`candidate-note ${variance === 0 ? 'candidate-match' : 'candidate-diff'}`}>{variance === 0 ? <CheckCircle2 size={14}/> : <TriangleAlert size={14}/>} {caseData.mode === 'demo_fixture' ? variance === 0 ? 'Sample shows the expected count' : `Sample depicts a ${Math.abs(variance)}-unit variance · fixed example` : variance === 0 ? 'Image suggests the expected count' : `Possible ${Math.abs(variance)}-unit variance · suggestion only`}</div>}
                    {observation?.visibility !== 'complete' && <div className="visibility-note"><TriangleAlert size={14}/>{observation?.visibility === 'partial' ? 'Partial view — visible quantity is not a shipment total.' : 'Contents aren’t visible — enter a count from your physical check.'}</div>}
                    <p className="evidence-copy">{observation?.evidence ?? 'No image observation for this line.'}</p>
                    {observation?.damage && <div className="damage-note"><TriangleAlert size={14}/><span><b>Damage to inspect:</b> {observation.damage}</span></div>}
                    {observation?.uncertainty && <p className="uncertainty-copy">{observation.uncertainty}</p>}
                    <label className={`confirm-toggle ${review.confirmed && isWholeCount(review.quantity) ? 'is-confirmed' : ''}`}><input type="checkbox" checked={review.confirmed} disabled={!isWholeCount(review.quantity)} onChange={(event) => updateReview(item.id, 'confirmed', event.target.checked)}/><span className="custom-check"><Check size={13}/></span><span>{caseData.syntheticDemoInput ? review.confirmed && isWholeCount(review.quantity) ? 'Simulated count reviewed for this synthetic demo' : 'I reviewed the depicted count for this synthetic demo' : review.confirmed && isWholeCount(review.quantity) ? 'Count reviewed and confirmed' : 'I physically checked and confirm this count'}</span></label>
                    {review.confirmed && <label className="operator-note"><span>REVIEW NOTE <small>(optional)</small></span><input value={review.note} placeholder="e.g. 4 pieces missing from open carton" onChange={(event) => updateReview(item.id, 'note', event.target.value)}/></label>}
                  </article>;
                })}</div>
                <div className="approval-footer"><div><div className="approval-state"><span className={`approval-dot ${allReviewed ? 'is-ready' : ''}`}/><strong>{allReviewed ? 'Ready to approve' : 'Review required'}</strong></div><p>{allReviewed ? caseData.syntheticDemoInput ? 'Every line has a simulated review confirmation.' : 'Every line has an operator-confirmed count.' : `Confirm each line to unlock the evidence packet. ${items.length - readyCount} remaining.`}</p></div><button className="button button-primary approval-button" onClick={exportPacket} disabled={!allReviewed || busy !== null}>{busy === 'export' ? <><LoaderCircle size={16} className="spin"/>Preparing…</> : <><ClipboardCheck size={16}/>{caseData.syntheticDemoInput ? 'Approve demo review & create packet' : 'Approve & create packet'}<ArrowRight size={15}/></>}</button></div>
              </div>
            </div>
          </>}

          {report?.status === 'ready' && <section className="packet-card" aria-live="polite"><div className="packet-header"><div className="packet-icon"><BadgeCheck size={20}/></div><div><div className="section-kicker">EVIDENCE PACKET READY</div><h3>Review complete. Ready to share.</h3></div><span className="packet-stamp">OPERATOR APPROVED</span></div><p>Counts are confirmed and the evidence is attached. PackProof does not send claims to suppliers.</p>{report.local && <p className="unsigned-note">This packet is assembled in your browser. It is not signed or tamper-resistant; download it to save a local copy.</p>}<div className="packet-actions"><button className="button button-dark" onClick={() => downloadFile('packproof-claim.json', JSON.stringify(report.reportJson, null, 2), 'application/json')}><ArrowDownToLine size={16}/> Download JSON</button><button className="button button-outline" onClick={() => downloadFile('packproof-claim.txt', report.reportText ?? '', 'text/plain')}><FileText size={16}/> Download readable report</button></div><pre className="packet-preview">{report.reportText}</pre></section>}
        </section>

        <section id="guide" className="how-section"><div><div className="section-kicker">A HUMAN-LED HANDOFF</div><h2>Less guesswork.<br/><em>Better receiving records.</em></h2></div><div className="how-steps"><div><span>01</span><b>Match the manifest</b><p>Paste a packing list or enter the expected shipment.</p></div><div><span>02</span><b>{isFixture ? 'Review the sample' : 'Capture what’s visible'}</b><p>{isFixture ? 'Fixed sample observations demonstrate the review flow.' : 'Gemini suggests visible counts, evidence, and uncertainty.'}</p></div><div><span>03</span><b>{caseData?.syntheticDemoInput ? 'Review the synthetic demo' : 'Confirm, then export'}</b><p>{caseData?.syntheticDemoInput ? 'This simulated review is not a physical receiving inspection.' : 'Your physical check decides the claim. The model never does.'}</p></div></div></section>
        <footer className="footer"><a className="brand footer-brand" href="#top"><span className="brand-mark"><PackageCheck size={17}/></span><span>packproof</span></a><span>Built for receiving teams · Every claim begins with evidence.</span><span className="footer-team">TEAM CODE RUSH</span></footer>
      </main>
    </div>
  );
}

function visibilityLabel(value?: Observation['visibility']) {
  return value === 'complete' ? 'COMPLETE VIEW' : value === 'partial' ? 'PARTIAL VIEW' : 'NOT VISIBLE';
}
function isWholeCount(value: string) { return value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0; }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please retry.'; }
function downloadFile(filename: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
