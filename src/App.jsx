import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, X, Check, Calendar as CalendarIcon, BarChart3, Printer, Download } from "lucide-react";
import { supabase } from "./supabaseClient";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

const CORES = {
  azul: { hex: "#5B8FB0", label: "Bom comportamento", bg: "#EAF2F7" },
  laranja: { hex: "#E08A35", label: "Comportamento razoável", bg: "#FBEBDC" },
  vermelho: { hex: "#C6604F", label: "Comportamento ruim", bg: "#F6E9E6" },
};

const PERIODOS = [
  { key: "manha", label: "Manhã" },
  { key: "tarde", label: "Tarde" },
  { key: "noite", label: "Noite" },
];

const PESSOAS = [
  { nome: "Eduardo", papel: "Pai" },
  { nome: "Cibele", papel: "Mãe" },
  { nome: "Danielle", papel: "Terapeuta" },
  { nome: "Ana Moya", papel: "Neuropsicóloga" },
];

const USER_KEY = "luiza_app_user";

function fmtKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isEmptyEntry(e) {
  return !e || (!e.manha && !e.tarde && !e.noite && !e.nota);
}

export default function App() {
  const today = new Date();
  const [tab, setTab] = useState("calendario");
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [data, setData] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [userName, setUserName] = useState(() => localStorage.getItem(USER_KEY) || "");
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    let channel;

    const load = async () => {
      const { data: rows, error } = await supabase.from("entries").select("*");
      if (!error && rows) {
        const map = {};
        rows.forEach((r) => {
          map[r.date] = { manha: r.manha, tarde: r.tarde, noite: r.noite, nota: r.nota, updated_by: r.updated_by };
        });
        setData(map);
      }
      setLoaded(true);
    };

    load();

    channel = supabase
      .channel("entries-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, (payload) => {
        setData((prev) => {
          const next = { ...prev };
          if (payload.eventType === "DELETE") {
            delete next[payload.old.date];
          } else {
            const r = payload.new;
            next[r.date] = { manha: r.manha, tarde: r.tarde, noite: r.noite, nota: r.nota, updated_by: r.updated_by };
          }
          return next;
        });
      })
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const persistEntry = useCallback(async (key, entry) => {
    if (isEmptyEntry(entry)) {
      await supabase.from("entries").delete().eq("date", key);
      setData((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    const record = {
      date: key,
      manha: entry.manha || null,
      tarde: entry.tarde || null,
      noite: entry.noite || null,
      nota: entry.nota || null,
      updated_by: userName || null,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("entries").upsert(record);
    setData((prev) => ({ ...prev, [key]: { manha: entry.manha || null, tarde: entry.tarde || null, noite: entry.noite || null, nota: entry.nota || null, updated_by: userName || null } }));
  }, [userName]);

  const setPeriod = (key, periodKey, color) => {
    const current = data[key] || {};
    const newColor = current[periodKey] === color ? null : color;
    persistEntry(key, { ...current, [periodKey]: newColor });
  };

  const saveNote = () => {
    if (!selected) return;
    const current = data[selected] || {};
    persistEntry(selected, { ...current, nota: noteDraft.trim() || null });
  };

  const openDay = (key) => {
    setSelected(key);
    setNoteDraft(data[key]?.nota || "");
  };

  const chooseName = (nome) => {
    localStorage.setItem(USER_KEY, nome);
    setUserName(nome);
  };

  const { y, m } = cursor;
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthEntries = Object.entries(data).filter(([k]) => k.startsWith(`${y}-${String(m + 1).padStart(2, "0")}`));
  const counts = { azul: 0, laranja: 0, vermelho: 0 };
  monthEntries.forEach(([, v]) => {
    PERIODOS.forEach((p) => { if (v[p.key]) counts[v[p.key]]++; });
  });
  const totalMarked = counts.azul + counts.laranja + counts.vermelho;

  const diasRuins = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = fmtKey(y, m, d);
    const entry = data[key];
    if (!entry) continue;
    const periodosRuins = PERIODOS.filter((p) => entry[p.key] === "vermelho").map((p) => p.label);
    if (periodosRuins.length > 0) {
      diasRuins.push({ dia: d, periodos: periodosRuins, nota: entry.nota || "" });
    }
  }

  const changeMonth = (delta) => {
    let nm = m + delta, ny = y;
    if (nm < 0) { nm = 11; ny--; }
    if (nm > 11) { nm = 0; ny++; }
    setCursor({ y: ny, m: nm });
  };

  const isToday = (d) => d === today.getDate() && m === today.getMonth() && y === today.getFullYear();

  const doPrint = async () => {
    if (!printRef.current) return;
    setGerandoPdf(true);
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgRatio = canvas.height / canvas.width;
      let renderWidth = pageWidth - 16;
      let renderHeight = renderWidth * imgRatio;
      if (renderHeight > pageHeight - 16) {
        renderHeight = pageHeight - 16;
        renderWidth = renderHeight / imgRatio;
      }
      const x = (pageWidth - renderWidth) / 2;
      const y = (pageHeight - renderHeight) / 2;
      pdf.addImage(imgData, "PNG", x, y, renderWidth, renderHeight);
      pdf.save(`calendario-luiza-${MESES[m].toLowerCase()}-${y}.pdf`);
    } catch (e) {
      console.error("Erro ao gerar PDF", e);
      alert("Não foi possível gerar o PDF. Tenta novamente.");
    } finally {
      setGerandoPdf(false);
    }
  };

  if (!userName) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7F4EE", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 360, border: "1px solid #F0EBDF" }}>
          <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#A98F5E", fontWeight: 700, marginBottom: 6 }}>
            Diário de acompanhamento
          </div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, color: "#33404D", margin: "0 0 14px" }}>Luiza</h1>
          <p style={{ fontSize: 13, color: "#5C6672", marginBottom: 14 }}>Quem está entrando?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PESSOAS.map((p) => (
              <button
                key={p.nome}
                onClick={() => chooseName(p.nome)}
                style={{
                  width: "100%", textAlign: "left", borderRadius: 12, border: "1px solid #EDE8DB",
                  background: "#FBFAF7", padding: "12px 14px", display: "flex", flexDirection: "column",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: "#33404D" }}>{p.nome}</span>
                <span style={{ fontSize: 12, color: "#8A93A0" }}>{p.papel}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F7F4EE", fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif", display: "flex", justifyContent: "center", padding: "24px 14px" }}>
      <style>{`
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        .day-cell { transition: transform 0.12s ease; }
        .day-cell:active { transform: scale(0.94); }
        .color-btn { transition: transform 0.12s ease; }
        .color-btn:active { transform: scale(0.92); }

        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area {
            position: absolute; left: 0; top: 0; width: 100%;
            padding: 10mm;
          }
          @page { size: A4 landscape; margin: 8mm; }
          .print-title { font-size: 28px !important; }
          .print-day-num { font-size: 20px !important; }
          .print-cell { min-height: 90px !important; padding: 8px !important; }
          .print-chip { width: 16px !important; height: 16px !important; }
          .print-legend-dot { width: 16px !important; height: 16px !important; }
          .print-legend-text { font-size: 14px !important; }
        }
      `}</style>

      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }} className="no-print">
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#A98F5E", fontWeight: 700, marginBottom: 4 }}>
              Diário de acompanhamento
            </div>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 30, color: "#33404D", margin: 0, fontWeight: 600 }}>Luiza</h1>
          </div>
          <div style={{ fontSize: 11, color: "#B3AC9C" }}>{userName}</div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }} className="no-print">
          <button
            onClick={() => setTab("calendario")}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "10px 0", borderRadius: 12, border: tab === "calendario" ? "1.5px solid #33404D" : "1px solid #E7E1D4",
              background: tab === "calendario" ? "#33404D" : "#fff", color: tab === "calendario" ? "#fff" : "#33404D", fontWeight: 700, fontSize: 13,
            }}
          >
            <CalendarIcon size={15} /> Calendário
          </button>
          <button
            onClick={() => setTab("dashboard")}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "10px 0", borderRadius: 12, border: tab === "dashboard" ? "1.5px solid #33404D" : "1px solid #E7E1D4",
              background: tab === "dashboard" ? "#33404D" : "#fff", color: tab === "dashboard" ? "#fff" : "#33404D", fontWeight: 700, fontSize: 13,
            }}
          >
            <BarChart3 size={15} /> Dashboard
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }} className="no-print">
          <button onClick={() => changeMonth(-1)} aria-label="Mês anterior" style={{ background: "#fff", border: "1px solid #E7E1D4", borderRadius: 12, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft size={18} color="#33404D" />
          </button>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#33404D" }}>
            {MESES[m]} <span style={{ color: "#A98F5E" }}>{y}</span>
          </div>
          <button onClick={() => changeMonth(1)} aria-label="Próximo mês" style={{ background: "#fff", border: "1px solid #E7E1D4", borderRadius: 12, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronRight size={18} color="#33404D" />
          </button>
        </div>

        {tab === "calendario" && (
          <>
            <div style={{ background: "#fff", borderRadius: 20, padding: 16, boxShadow: "0 4px 18px rgba(51,64,77,0.06)", border: "1px solid #F0EBDF" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 6 }}>
                {DIAS_SEMANA.map((d, i) => (
                  <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#B3AC9C", padding: "4px 0" }}>{d}</div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
                {!loaded && <div style={{ gridColumn: "span 7", textAlign: "center", padding: 24, color: "#B3AC9C", fontSize: 13 }}>Carregando...</div>}
                {loaded && cells.map((d, i) => {
                  if (d === null) return <div key={i} />;
                  const key = fmtKey(y, m, d);
                  const entry = data[key];
                  return (
                    <button
                      key={i}
                      className="day-cell"
                      onClick={() => openDay(key)}
                      style={{
                        position: "relative",
                        height: 54,
                        border: isToday(d) ? "1.5px solid #A98F5E" : "1px solid transparent",
                        background: "#FBFAF7",
                        borderRadius: 12,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: isToday(d) ? 800 : 600, color: "#33404D" }}>{d}</span>
                      <div style={{ display: "flex", gap: 3 }}>
                        {PERIODOS.map((p) => (
                          <span
                            key={p.key}
                            style={{
                              width: 9, height: 9, borderRadius: "50%",
                              background: entry?.[p.key] ? CORES[entry[p.key]].hex : "#E3DFD2",
                            }}
                          />
                        ))}
                      </div>
                      {entry?.nota && (
                        <span style={{ position: "absolute", top: 3, right: 4, width: 4, height: 4, borderRadius: "50%", background: "#A98F5E" }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {Object.entries(CORES).map(([key, c]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5C6672" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.hex }} />
                  {c.label}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#B3AC9C", marginTop: 6 }}>Cada dia tem 3 marcações: manhã, tarde e noite.</div>
          </>
        )}

        {tab === "dashboard" && (
          <>
            <button onClick={doPrint} disabled={gerandoPdf} className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", background: "#33404D", color: "#fff", border: "none", borderRadius: 12, padding: 12, fontWeight: 700, fontSize: 14, marginBottom: 16, opacity: gerandoPdf ? 0.7 : 1 }}>
              <Download size={16} /> {gerandoPdf ? "Gerando PDF..." : "Baixar PDF deste mês"}
            </button>

            <div id="print-area" ref={printRef} style={{ background: "#fff", borderRadius: 20, padding: 18, boxShadow: "0 4px 18px rgba(51,64,77,0.06)", border: "1px solid #F0EBDF" }}>
              <div className="print-title" style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#33404D", marginBottom: 4, fontWeight: 600 }}>
                Luiza — {MESES[m]} de {y}
              </div>
              <div style={{ fontSize: 12, color: "#8A93A0", marginBottom: 14 }}>Diário de acompanhamento comportamental</div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 6 }}>
                {DIAS_SEMANA.map((d, i) => (
                  <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#B3AC9C", padding: "4px 0" }}>{d}</div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
                {cells.map((d, i) => {
                  if (d === null) return <div key={i} />;
                  const key = fmtKey(y, m, d);
                  const entry = data[key];
                  return (
                    <div key={i} className="print-cell" style={{ border: "1px solid #EDE8DB", borderRadius: 10, padding: 6, minHeight: 62 }}>
                      <div className="print-day-num" style={{ fontSize: 12, fontWeight: 700, color: "#33404D", marginBottom: 4 }}>{d}</div>
                      {PERIODOS.map((p) => (
                        <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                          <span className="print-chip" style={{ width: 8, height: 8, borderRadius: "50%", background: entry?.[p.key] ? CORES[entry[p.key]].hex : "#E3DFD2", flexShrink: 0 }} />
                          <span style={{ fontSize: 9, color: "#8A93A0" }}>{p.label}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 16, marginTop: 18, flexWrap: "wrap" }}>
                {Object.entries(CORES).map(([key, c]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5C6672" }} className="print-legend-text">
                    <span className="print-legend-dot" style={{ width: 10, height: 10, borderRadius: "50%", background: c.hex }} />
                    {c.label}
                  </div>
                ))}
              </div>

              {totalMarked > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #F0EBDF" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#B3AC9C", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                    Resumo do mês (total de marcações)
                  </div>
                  <div style={{ display: "flex", height: 10, borderRadius: 4, overflow: "hidden", marginBottom: 10, background: "#F0EBDF" }}>
                    {Object.entries(CORES).map(([key, c]) => (
                      counts[key] > 0 && <div key={key} style={{ width: `${(counts[key] / totalMarked) * 100}%`, background: c.hex }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 18 }}>
                    {Object.entries(CORES).map(([key, c]) => (
                      <div key={key} style={{ fontSize: 13, color: "#33404D" }}>
                        <span style={{ fontWeight: 800 }}>{counts[key]}</span>
                        <span style={{ color: "#8A93A0" }}> {c.label.toLowerCase()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diasRuins.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #F0EBDF" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#B3AC9C", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                    Comportamentos difíceis do mês
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {diasRuins.map((item) => (
                      <div key={item.dia} style={{ border: "1px solid #F6E9E6", background: "#FBF4F3", borderRadius: 10, padding: "8px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: item.nota ? 4 : 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#33404D" }}>Dia {item.dia}</span>
                          <span style={{ fontSize: 11, color: "#C6604F", fontWeight: 600 }}>{item.periodos.join(", ")}</span>
                        </div>
                        {item.nota && <div style={{ fontSize: 12, color: "#5C6672" }}>{item.nota}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, background: "rgba(51,64,77,0.35)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} className="no-print">
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxWidth: 460, boxShadow: "0 -8px 24px rgba(0,0,0,0.12)", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: "#33404D", fontSize: 15 }}>
                {Number(selected.split("-")[2])} de {MESES[Number(selected.split("-")[1]) - 1]}
              </div>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", padding: 4 }}>
                <X size={20} color="#8A93A0" />
              </button>
            </div>

            {PERIODOS.map((p) => (
              <div key={p.key} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#5C6672", marginBottom: 8 }}>{p.label}</div>
                <div style={{ display: "flex", gap: 10 }}>
                  {Object.entries(CORES).map(([key, c]) => (
                    <button
                      key={key}
                      className="color-btn"
                      onClick={() => setPeriod(selected, p.key, key)}
                      style={{
                        flex: 1,
                        padding: "10px 6px",
                        borderRadius: 14,
                        border: data[selected]?.[p.key] === key ? `2px solid ${c.hex}` : "1px solid #EDE8DB",
                        background: data[selected]?.[p.key] === key ? c.bg : "#FBFAF7",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: "50%", background: c.hex, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {data[selected]?.[p.key] === key && <Check size={12} color="#fff" strokeWidth={3} />}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#33404D", textAlign: "center" }}>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Observação do dia (opcional)"
              rows={3}
              style={{ width: "100%", borderRadius: 12, border: "1px solid #EDE8DB", padding: 12, fontSize: 13, color: "#33404D", resize: "none", marginBottom: 6, fontFamily: "inherit" }}
            />
            {data[selected]?.updated_by && (
              <div style={{ fontSize: 11, color: "#B3AC9C", marginBottom: 12 }}>Última edição: {data[selected].updated_by}</div>
            )}
            <button
              onClick={() => { saveNote(); setSelected(null); }}
              style={{ width: "100%", background: "#33404D", color: "#fff", border: "none", borderRadius: 12, padding: 13, fontWeight: 700, fontSize: 14 }}
            >
              Salvar observação
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
