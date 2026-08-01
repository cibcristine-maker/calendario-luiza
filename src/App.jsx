import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, X, Check } from "lucide-react";
import { supabase } from "./supabaseClient";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

const CORES = {
  azul: { hex: "#5B8FB0", label: "Dia tranquilo", bg: "#EAF2F7" },
  amarelo: { hex: "#E0A835", label: "Dia médio", bg: "#FBF3E3" },
  vermelho: { hex: "#C6604F", label: "Dia difícil", bg: "#F6E9E6" },
};

const USER_KEY = "luiza_app_user";

function fmtKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function App() {
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [data, setData] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [userName, setUserName] = useState(() => localStorage.getItem(USER_KEY) || "");
  const [nameDraft, setNameDraft] = useState("");

  // Load all entries + subscribe to realtime changes
  useEffect(() => {
    let channel;

    const load = async () => {
      const { data: rows, error } = await supabase.from("entries").select("*");
      if (!error && rows) {
        const map = {};
        rows.forEach((r) => {
          map[r.date] = { cor: r.cor, nota: r.nota, updated_by: r.updated_by };
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
            next[r.date] = { cor: r.cor, nota: r.nota, updated_by: r.updated_by };
          }
          return next;
        });
      })
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const upsertDay = useCallback(async (key, cor, nota) => {
    if (!cor && !nota) {
      await supabase.from("entries").delete().eq("date", key);
      setData((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    const record = { date: key, cor: cor || null, nota: nota || null, updated_by: userName || null, updated_at: new Date().toISOString() };
    await supabase.from("entries").upsert(record);
    setData((prev) => ({ ...prev, [key]: { cor: cor || null, nota: nota || null, updated_by: userName || null } }));
  }, [userName]);

  const setDay = (key, color) => {
    const current = data[key] || {};
    const newColor = current.cor === color ? null : color;
    upsertDay(key, newColor, current.nota);
  };

  const saveNote = () => {
    if (!selected) return;
    const current = data[selected] || {};
    upsertDay(selected, current.cor, noteDraft.trim() || null);
  };

  const openDay = (key) => {
    setSelected(key);
    setNoteDraft(data[key]?.nota || "");
  };

  const saveName = () => {
    const n = nameDraft.trim();
    if (!n) return;
    localStorage.setItem(USER_KEY, n);
    setUserName(n);
  };

  const { y, m } = cursor;
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthEntries = Object.entries(data).filter(([k]) => k.startsWith(`${y}-${String(m + 1).padStart(2, "0")}`));
  const counts = { azul: 0, amarelo: 0, vermelho: 0 };
  monthEntries.forEach(([, v]) => { if (v.cor) counts[v.cor]++; });
  const totalMarked = counts.azul + counts.amarelo + counts.vermelho;

  const changeMonth = (delta) => {
    let nm = m + delta, ny = y;
    if (nm < 0) { nm = 11; ny--; }
    if (nm > 11) { nm = 0; ny++; }
    setCursor({ y: ny, m: nm });
  };

  const isToday = (d) => d === today.getDate() && m === today.getMonth() && y === today.getFullYear();

  // First-time name gate so notes/edits are attributed to a person
  if (!userName) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7F4EE", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 360, border: "1px solid #F0EBDF" }}>
          <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#A98F5E", fontWeight: 700, marginBottom: 6 }}>
            Diário de acompanhamento
          </div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, color: "#33404D", margin: "0 0 14px" }}>Luiza</h1>
          <p style={{ fontSize: 13, color: "#5C6672", marginBottom: 14 }}>Como podemos te identificar nas anotações?</p>
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            placeholder="Seu nome"
            style={{ width: "100%", borderRadius: 12, border: "1px solid #EDE8DB", padding: 12, fontSize: 14, marginBottom: 14, boxSizing: "border-box" }}
          />
          <button onClick={saveName} style={{ width: "100%", background: "#33404D", color: "#fff", border: "none", borderRadius: 12, padding: 13, fontWeight: 700, fontSize: 14 }}>
            Entrar
          </button>
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
      `}</style>

      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ marginBottom: 22, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#A98F5E", fontWeight: 700, marginBottom: 4 }}>
              Diário de acompanhamento
            </div>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 30, color: "#33404D", margin: 0, fontWeight: 600 }}>Luiza</h1>
          </div>
          <div style={{ fontSize: 11, color: "#B3AC9C" }}>{userName}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
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
              const cor = entry?.cor;
              return (
                <button
                  key={i}
                  className="day-cell"
                  onClick={() => openDay(key)}
                  style={{
                    position: "relative",
                    height: 42,
                    border: isToday(d) ? "1.5px solid #A98F5E" : "1px solid transparent",
                    background: cor ? CORES[cor].bg : "#FBFAF7",
                    borderRadius: 12,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: isToday(d) ? 800 : 600, color: "#33404D" }}>{d}</span>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: cor ? CORES[cor].hex : "transparent" }} />
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
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.hex }} />
              {c.label}
            </div>
          ))}
        </div>

        {totalMarked > 0 && (
          <div style={{ marginTop: 18, background: "#fff", borderRadius: 16, padding: "14px 16px", border: "1px solid #F0EBDF" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#B3AC9C", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              Resumo do mês
            </div>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10, background: "#F0EBDF" }}>
              {Object.entries(CORES).map(([key, c]) => (
                counts[key] > 0 && <div key={key} style={{ width: `${(counts[key] / totalMarked) * 100}%`, background: c.hex }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              {Object.entries(CORES).map(([key, c]) => (
                <div key={key} style={{ fontSize: 13, color: "#33404D" }}>
                  <span style={{ fontWeight: 800 }}>{counts[key]}</span>
                  <span style={{ color: "#8A93A0" }}> {key}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, background: "rgba(51,64,77,0.35)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxWidth: 420, boxShadow: "0 -8px 24px rgba(0,0,0,0.12)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: "#33404D", fontSize: 15 }}>
                {Number(selected.split("-")[2])} de {MESES[Number(selected.split("-")[1]) - 1]}
              </div>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", padding: 4 }}>
                <X size={20} color="#8A93A0" />
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {Object.entries(CORES).map(([key, c]) => (
                <button
                  key={key}
                  className="color-btn"
                  onClick={() => setDay(selected, key)}
                  style={{
                    flex: 1,
                    padding: "12px 8px",
                    borderRadius: 14,
                    border: data[selected]?.cor === key ? `2px solid ${c.hex}` : "1px solid #EDE8DB",
                    background: data[selected]?.cor === key ? c.bg : "#FBFAF7",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: c.hex, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {data[selected]?.cor === key && <Check size={11} color="#fff" strokeWidth={3} />}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#33404D" }}>{c.label}</span>
                </button>
              ))}
            </div>

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
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
