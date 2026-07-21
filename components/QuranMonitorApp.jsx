"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";

const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const PALETTE = ["#0F4A38", "#C9A227", "#145C46", "#9C7D1C", "#3A7D6E", "#A83A2C", "#2E6B5E", "#6B8F7D"];

const REASON_LABELS = {
  sakit: "Sakit",
  izin: "Izin",
  dinas_luar: "Dinas Luar",
  lainnya: "Lainnya",
};

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function formatDateLong(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  return `${h} jam lalu`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function monthBounds(yearMonth) {
  const [y, m] = yearMonth.split("-").map(Number);
  const start = `${y}-${pad2(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const todayD = todayStr();
  const naturalEnd = `${y}-${pad2(m)}-${pad2(lastDay)}`;
  const end = naturalEnd > todayD ? todayD : naturalEnd;
  return { start, end };
}

function semesterMonths(startYear, semester) {
  const months = [];
  if (semester === "ganjil") {
    for (let m = 7; m <= 12; m++) months.push(`${startYear}-${pad2(m)}`);
  } else {
    for (let m = 1; m <= 6; m++) months.push(`${startYear + 1}-${pad2(m)}`);
  }
  return months;
}

function currentAcademicStartYear() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 7 ? y : y - 1;
}

function GeometricDivider() {
  return (
    <div className="w-full flex justify-center select-none" aria-hidden="true">
      <svg width="100%" height="14" viewBox="0 0 400 14" preserveAspectRatio="none" className="max-w-3xl opacity-70">
        {Array.from({ length: 20 }).map((_, i) => (
          <polygon
            key={i}
            points={`${i * 20 + 10},1 ${i * 20 + 18},7 ${i * 20 + 10},13 ${i * 20 + 2},7`}
            fill="none"
            stroke="#C9A227"
            strokeWidth="1"
          />
        ))}
      </svg>
    </div>
  );
}

function TasbihProgress({ done, total }) {
  const beads = Array.from({ length: total });
  return (
    <div className="flex flex-wrap gap-1" aria-label={`${done} dari ${total} kelas sudah lapor`}>
      {beads.map((_, i) => (
        <span key={i} className={`inline-block w-2.5 h-2.5 rounded-full ${i < done ? "bg-green" : "bg-line"}`} />
      ))}
    </div>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-sm shadow-lg no-print z-50 bg-green text-cream">
      {message}
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-line mb-5">
      <h3 className="text-sm font-semibold font-display text-green-deep">{title}</h3>
      {subtitle && <p className="text-xs text-muted mb-3">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-3"}>{children}</div>
    </div>
  );
}

export default function QuranMonitorApp() {
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [view, setView] = useState("input"); // input | dashboard | recap | manage
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [reports, setReports] = useState({});
  const [teacherAtt, setTeacherAtt] = useState([]);
  const [nonMuslim, setNonMuslim] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [toast, setToast] = useState("");
  const [session, setSession] = useState(null);
  const [pendingProtectedView, setPendingProtectedView] = useState(null);
  const pollRef = useRef(null);

  const isPrincipal = !!session;

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadClasses = useCallback(async () => {
    const { data, error } = await supabase.from("classes").select("*").order("sort_order");
    if (!error && data) setClasses(data);
  }, []);

  const loadTeachers = useCallback(async () => {
    const { data, error } = await supabase.from("teachers").select("*").order("name");
    if (!error && data) setTeachers(data);
  }, []);

  useEffect(() => {
    loadClasses();
    loadTeachers();
  }, [loadClasses, loadTeachers]);

  const loadReports = useCallback(async (dateStr) => {
    setLoading(true);
    const [rRes, taRes, nmRes] = await Promise.all([
      supabase.from("reports").select("*").eq("report_date", dateStr),
      supabase.from("teacher_attendance").select("*").eq("report_date", dateStr).order("created_at"),
      supabase.from("non_muslim_reports").select("*").eq("report_date", dateStr),
    ]);
    if (!rRes.error && rRes.data) {
      const next = {};
      rRes.data.forEach((r) => (next[r.class_name] = r));
      setReports(next);
    }
    if (!taRes.error && taRes.data) setTeacherAtt(taRes.data);
    if (!nmRes.error && nmRes.data) {
      const next = {};
      nmRes.data.forEach((r) => (next[`${r.grade}:${r.agama}`] = r));
      setNonMuslim(next);
    }
    setLoading(false);
    setLastRefresh(Date.now());
  }, []);

  useEffect(() => {
    loadReports(selectedDate);
  }, [selectedDate, loadReports]);

  useEffect(() => {
    if (view !== "dashboard") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => loadReports(selectedDate), 8000);
    return () => clearInterval(pollRef.current);
  }, [view, selectedDate, loadReports]);

  const fetchRangeData = useCallback(async (table, startDate, endDate) => {
    const { data, error } = await supabase.from(table).select("*").gte("report_date", startDate).lte("report_date", endDate);
    if (error) {
      console.error(error);
      return [];
    }
    return data || [];
  }, []);

  const doneCount = classes.filter((c) => reports[c.name]).length;
  const protectedViews = ["dashboard", "recap", "manage"];

  const handleNavClick = (key) => {
    if (protectedViews.includes(key) && !isPrincipal) {
      setPendingProtectedView(key);
      return;
    }
    setView(key);
  };

  const handleLoginSuccess = () => {
    const target = pendingProtectedView;
    setPendingProtectedView(null);
    setView(target || "dashboard");
    showToast("Berhasil masuk sebagai Kepala Sekolah");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setView("input");
    showToast("Berhasil keluar");
  };

  return (
    <div className="min-h-screen w-full bg-cream font-body">
      <header className="border-b border-line no-print">
        <div className="max-w-5xl mx-auto px-6 pt-8 pb-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-start gap-4">
              <img src="/logo-smpn36.jpg" alt="Logo SMP Negeri 36 Bandung" className="w-14 h-14 object-contain rounded-full ring-2 ring-gold/60 shrink-0" />
              <div>
                <p className="text-xs tracking-widest uppercase text-gold-deep" style={{ letterSpacing: "0.18em" }}>
                  SMP Negeri 36 Bandung — Pembiasaan Jam Pertama
                </p>
                <h1 className="text-3xl sm:text-4xl mt-1 font-display font-bold text-green-deep">
                  Monitoring Pembiasaan Pagi
                </h1>
                <p className="text-sm mt-1 text-muted">{formatDateLong(selectedDate)}</p>
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-2">
              <div>
                <div className="text-3xl font-semibold font-display text-green-deep">{doneCount}/{classes.length}</div>
                <p className="text-xs text-muted">kelas sudah lapor tilawah</p>
                <div className="mt-2">
                  <TasbihProgress done={doneCount} total={classes.length} />
                </div>
              </div>
              <div>
                {isPrincipal ? (
                  <button onClick={handleSignOut} className="text-xs px-3 py-1 rounded-full font-medium bg-green-soft text-green-deep">
                    Kepala Sekolah · Keluar
                  </button>
                ) : (
                  <button onClick={() => setPendingProtectedView("dashboard")} className="text-xs px-3 py-1 rounded-full font-medium bg-white border border-line text-green-deep">
                    Masuk Kepala Sekolah
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <GeometricDivider />
      </header>

      <nav className="max-w-5xl mx-auto px-6 pt-5 flex gap-2 flex-wrap no-print">
        {[
          { key: "input", label: "Input Laporan Kelas" },
          { key: "dashboard", label: "Dasbor Real-time" },
          { key: "recap", label: "Rekap Bulanan & Semester" },
          { key: "manage", label: "Kelola Sekolah" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => handleNavClick(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              view === t.key ? "bg-green-deep text-cream" : "bg-white text-green-deep border border-line"
            }`}
          >
            {t.label}
            {protectedViews.includes(t.key) && !isPrincipal && <span className="ml-1.5 opacity-60">🔒</span>}
          </button>
        ))}
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-6 print-area">
        {pendingProtectedView && !isPrincipal && (
          <LoginGate onCancel={() => setPendingProtectedView(null)} onSuccess={handleLoginSuccess} />
        )}

        {!pendingProtectedView && view === "input" && (
          <InputHub
            classes={classes}
            teachers={teachers}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            reports={reports}
            teacherAtt={teacherAtt}
            nonMuslim={nonMuslim}
            onReportSaved={(cls, row) => {
              setReports((prev) => ({ ...prev, [cls]: row }));
              showToast(`Laporan tilawah ${cls} tersimpan`);
            }}
            onAttendanceChanged={() => loadReports(selectedDate)}
            onNonMuslimSaved={(key, row) => {
              setNonMuslim((prev) => ({ ...prev, [key]: row }));
              showToast("Kegiatan non-muslim tersimpan");
            }}
            showToast={showToast}
          />
        )}

        {!pendingProtectedView && view === "dashboard" && isPrincipal && (
          <DashboardView
            classes={classes}
            reports={reports}
            teacherAtt={teacherAtt}
            nonMuslim={nonMuslim}
            loading={loading}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            lastRefresh={lastRefresh}
            onManualRefresh={() => loadReports(selectedDate)}
          />
        )}

        {!pendingProtectedView && view === "recap" && isPrincipal && (
          <RecapView classes={classes} fetchRangeData={fetchRangeData} showToast={showToast} />
        )}

        {!pendingProtectedView && view === "manage" && isPrincipal && (
          <ManageView
            classes={classes}
            teachers={teachers}
            onClassesChanged={loadClasses}
            onTeachersChanged={loadTeachers}
            showToast={showToast}
            session={session}
          />
        )}
      </main>

      <Toast message={toast} />
    </div>
  );
}

function LoginGate({ onCancel, onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [checking, setChecking] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setInfo("");
    setChecking(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setChecking(false);
    if (signInError) {
      setError("Email atau kata sandi salah.");
      return;
    }
    onSuccess();
  };

  const handleResetPassword = async () => {
    setError("");
    setInfo("");
    if (!email.trim()) {
      setError("Isi email terlebih dahulu untuk mengirim tautan reset.");
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (resetError) setError("Gagal mengirim tautan reset kata sandi.");
    else setInfo("Tautan reset kata sandi telah dikirim ke email tersebut.");
  };

  return (
    <div className="max-w-sm mx-auto bg-white rounded-xl p-6 border border-line">
      <div className="flex justify-center mb-3">
        <img src="/logo-smpn36.jpg" alt="Logo SMPN 36 Bandung" className="w-16 h-16 object-contain" />
      </div>
      <h2 className="text-xl font-semibold mb-1 text-center font-display text-green-deep">Masuk Kepala Sekolah</h2>
      <p className="text-sm text-center mb-4 text-muted">Halaman ini khusus untuk kepala sekolah memantau program.</p>
      <div className="space-y-3">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full px-3 py-2 rounded-lg border border-line text-sm" autoFocus />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="Kata sandi" className="w-full px-3 py-2 rounded-lg border border-line text-sm" />
      </div>
      {error && <p className="text-sm mt-2 text-center text-crimson">{error}</p>}
      {info && <p className="text-sm mt-2 text-center text-green-deep">{info}</p>}
      <div className="flex gap-2 mt-4">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg text-sm font-medium bg-white border border-line text-muted">Batal</button>
        <button onClick={handleSubmit} disabled={checking || !email.trim() || !password} className="flex-1 py-2 rounded-lg text-sm font-medium bg-green-deep text-cream disabled:opacity-70">
          {checking ? "Memeriksa..." : "Masuk"}
        </button>
      </div>
      <button onClick={handleResetPassword} className="w-full text-xs mt-3 text-center text-gold-deep underline">Lupa kata sandi?</button>
      <p className="text-xs text-center mt-3 text-muted">Akun kepala sekolah dibuat oleh admin melalui Supabase (lihat README).</p>
    </div>
  );
}

// ============================= INPUT HUB (diisi Ketua Kelas) =============================

function InputHub({ classes, teachers, selectedDate, setSelectedDate, reports, teacherAtt, nonMuslim, onReportSaved, onAttendanceChanged, onNonMuslimSaved, showToast }) {
  const [tab, setTab] = useState("tilawah"); // tilawah | presensi | nonmuslim

  return (
    <div>
      <p className="text-xs mb-3 text-muted">
        Diisi oleh <span className="font-medium text-ink">ketua kelas / perwakilan kelas</span>. Tidak perlu login.
      </p>
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: "tilawah", label: "Tilawah Al-Qur'an" },
          { key: "presensi", label: "Presensi Guru" },
          { key: "nonmuslim", label: "Kegiatan Non-Muslim" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${tab === t.key ? "bg-gold text-white" : "bg-white text-green-deep border border-line"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "tilawah" && (
        <TilawahForm classes={classes} teachers={teachers} selectedDate={selectedDate} setSelectedDate={setSelectedDate} reports={reports} onSaved={onReportSaved} />
      )}
      {tab === "presensi" && (
        <TeacherAttendanceForm classes={classes} teachers={teachers} selectedDate={selectedDate} setSelectedDate={setSelectedDate} entries={teacherAtt} onChanged={onAttendanceChanged} showToast={showToast} />
      )}
      {tab === "nonmuslim" && (
        <NonMuslimForm teachers={teachers} selectedDate={selectedDate} setSelectedDate={setSelectedDate} nonMuslim={nonMuslim} onSaved={onNonMuslimSaved} />
      )}
    </div>
  );
}

function TeacherPicker({ teachers, value, onChange, placeholder = "Pilih guru..." }) {
  const [customMode, setCustomMode] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-end mb-1">
        <button type="button" onClick={() => setCustomMode((v) => !v)} className="text-[11px] underline text-gold-deep">
          {customMode ? "Pilih dari daftar" : "Nama tidak ada di daftar?"}
        </button>
      </div>
      {customMode || teachers.length === 0 ? (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ketik nama guru" className="w-full px-3 py-2 rounded-lg border border-line text-sm" />
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line text-sm">
          <option value="">{placeholder}</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.name}>{t.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function TilawahForm({ classes, teachers, selectedDate, setSelectedDate, reports, onSaved }) {
  const [selectedClass, setSelectedClass] = useState("");
  const [surah, setSurah] = useState("");
  const [ayatRange, setAyatRange] = useState("");
  const [jumlahAyat, setJumlahAyat] = useState("");
  const [hadir, setHadir] = useState("");
  const [totalSiswa, setTotalSiswa] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedClass && classes.length) setSelectedClass(classes[0].name);
  }, [classes, selectedClass]);

  useEffect(() => {
    const existing = reports[selectedClass];
    if (existing) {
      setSurah(existing.surah || "");
      setAyatRange(existing.ayat_range || "");
      setJumlahAyat(existing.jumlah_ayat ?? "");
      setHadir(existing.present_count ?? "");
      setTotalSiswa(existing.total_students ?? "");
      setTeacherName(existing.teacher_name || "");
      setNotes(existing.notes || "");
    } else {
      setSurah(""); setAyatRange(""); setJumlahAyat(""); setHadir(""); setTotalSiswa(""); setTeacherName(""); setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, selectedDate]);

  const handleSubmit = async () => {
    setError("");
    if (!selectedClass) return setError("Pilih kelas terlebih dahulu.");
    if (!surah.trim() || !teacherName.trim()) return setError("Surat yang dibaca dan nama guru pendamping wajib diisi.");
    setSaving(true);
    const payload = {
      report_date: selectedDate,
      class_name: selectedClass,
      surah: surah.trim(),
      ayat_range: ayatRange.trim(),
      jumlah_ayat: jumlahAyat === "" ? 0 : Number(jumlahAyat),
      present_count: hadir === "" ? null : Number(hadir),
      total_students: totalSiswa === "" ? null : Number(totalSiswa),
      teacher_name: teacherName.trim(),
      notes: notes.trim(),
      updated_at: new Date().toISOString(),
    };
    const { data, error: saveError } = await supabase.from("reports").upsert(payload, { onConflict: "report_date,class_name" }).select().single();
    setSaving(false);
    if (saveError) return setError("Gagal menyimpan laporan. Coba lagi.");
    onSaved(selectedClass, data);
  };

  return (
    <div className="max-w-xl bg-white rounded-xl p-5 space-y-4 border border-line">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted">Tanggal</label>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Kelas</label>
          <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm">
            {classes.map((c) => <option key={c.id} value={c.name}>Kelas {c.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted">Surat yang dibaca</label>
        <input type="text" value={surah} onChange={(e) => setSurah(e.target.value)} placeholder="Contoh: Al-Baqarah" className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted">Rentang ayat (keterangan)</label>
          <input type="text" value={ayatRange} onChange={(e) => setAyatRange(e.target.value)} placeholder="Contoh: ayat 10-25" className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Jumlah ayat (angka)</label>
          <input type="number" min="0" value={jumlahAyat} onChange={(e) => setJumlahAyat(e.target.value)} placeholder="Contoh: 15" className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
          <p className="text-[11px] mt-1 text-muted">Dipakai untuk grafik & rekap ketercapaian</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted">Siswa hadir</label>
          <input type="number" min="0" value={hadir} onChange={(e) => setHadir(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Jumlah siswa</label>
          <input type="number" min="0" value={totalSiswa} onChange={(e) => setTotalSiswa(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted">Guru yang mendampingi hari ini</label>
        <div className="mt-1">
          <TeacherPicker teachers={teachers} value={teacherName} onChange={setTeacherName} />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted">Catatan / kendala (opsional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
      </div>

      {error && <p className="text-sm text-crimson">{error}</p>}

      <button onClick={handleSubmit} disabled={saving} className="w-full py-2.5 rounded-lg text-sm font-medium bg-green-deep text-cream disabled:opacity-70">
        {saving ? "Menyimpan..." : "Simpan Laporan"}
      </button>
    </div>
  );
}

function TeacherAttendanceForm({ classes, teachers, selectedDate, setSelectedDate, entries, onChanged, showToast }) {
  const [selectedClass, setSelectedClass] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [status, setStatus] = useState("hadir");
  const [reason, setReason] = useState("sakit");
  const [taskNotes, setTaskNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedClass && classes.length) setSelectedClass(classes[0].name);
  }, [classes, selectedClass]);

  const classEntries = entries.filter((e) => e.class_name === selectedClass);

  const handleAdd = async () => {
    setError("");
    if (!selectedClass) return setError("Pilih kelas terlebih dahulu.");
    if (!teacherName.trim()) return setError("Pilih atau isi nama guru.");
    if (status === "tidak_hadir" && !reason) return setError("Pilih alasan ketidakhadiran.");
    setSaving(true);
    const payload = {
      report_date: selectedDate,
      class_name: selectedClass,
      period_label: periodLabel.trim() || null,
      teacher_name: teacherName.trim(),
      status,
      reason: status === "tidak_hadir" ? reason : null,
      task_notes: status === "tidak_hadir" ? taskNotes.trim() : null,
    };
    const { error: insertError } = await supabase.from("teacher_attendance").insert(payload);
    setSaving(false);
    if (insertError) return setError("Gagal menyimpan presensi. Coba lagi.");
    setPeriodLabel(""); setTeacherName(""); setStatus("hadir"); setReason("sakit"); setTaskNotes("");
    onChanged();
    showToast("Presensi guru tersimpan");
  };

  const handleDelete = async (id) => {
    const { error: delError } = await supabase.from("teacher_attendance").delete().eq("id", id);
    if (delError) return showToast("Gagal menghapus entri");
    onChanged();
    showToast("Entri dihapus");
  };

  return (
    <div className="max-w-xl space-y-5">
      <div className="bg-white rounded-xl p-5 space-y-4 border border-line">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted">Tanggal</label>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Kelas</label>
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm">
              {classes.map((c) => <option key={c.id} value={c.name}>Kelas {c.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted">Jam ke / mata pelajaran (opsional)</label>
          <input type="text" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="Contoh: Jam ke-3 / Matematika" className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
        </div>

        <div>
          <label className="text-xs font-medium text-muted">Guru</label>
          <div className="mt-1">
            <TeacherPicker teachers={teachers} value={teacherName} onChange={setTeacherName} />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted">Status kehadiran</label>
          <div className="flex gap-2 mt-1">
            <button type="button" onClick={() => setStatus("hadir")} className={`flex-1 py-2 rounded-lg text-sm font-medium ${status === "hadir" ? "bg-green-deep text-cream" : "bg-cream text-muted border border-line"}`}>Hadir</button>
            <button type="button" onClick={() => setStatus("tidak_hadir")} className={`flex-1 py-2 rounded-lg text-sm font-medium ${status === "tidak_hadir" ? "bg-crimson text-cream" : "bg-cream text-muted border border-line"}`}>Tidak Hadir</button>
          </div>
        </div>

        {status === "tidak_hadir" && (
          <>
            <div>
              <label className="text-xs font-medium text-muted">Alasan tidak hadir</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm">
                {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted">Keterangan tugas yang diberikan</label>
              <textarea value={taskNotes} onChange={(e) => setTaskNotes(e.target.value)} rows={2} placeholder="Contoh: Mengerjakan LKS halaman 20-22" className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
            </div>
          </>
        )}

        {error && <p className="text-sm text-crimson">{error}</p>}

        <button onClick={handleAdd} disabled={saving} className="w-full py-2.5 rounded-lg text-sm font-medium bg-green-deep text-cream disabled:opacity-70">
          {saving ? "Menyimpan..." : "Tambah Catatan"}
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2 font-display text-green-deep">
          Catatan Hari Ini — Kelas {selectedClass || "-"}
        </h3>
        {classEntries.length === 0 ? (
          <p className="text-sm text-muted">Belum ada catatan presensi guru untuk kelas ini hari ini.</p>
        ) : (
          <ul className="space-y-2">
            {classEntries.map((e) => (
              <li key={e.id} className="bg-white rounded-lg p-3 border border-line text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">{e.teacher_name} {e.period_label ? `· ${e.period_label}` : ""}</p>
                    <p className={`text-xs mt-0.5 ${e.status === "hadir" ? "text-green-deep" : "text-crimson"}`}>
                      {e.status === "hadir" ? "Hadir" : `Tidak Hadir — ${REASON_LABELS[e.reason] || e.reason}`}
                    </p>
                    {e.task_notes && <p className="text-xs mt-1 text-muted italic">Tugas: {e.task_notes}</p>}
                  </div>
                  <button onClick={() => handleDelete(e.id)} className="text-xs text-crimson font-medium shrink-0">Hapus</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NonMuslimForm({ teachers, selectedDate, setSelectedDate, nonMuslim, onSaved }) {
  const [grade, setGrade] = useState("7");
  const [agama, setAgama] = useState("protestan");
  const [materi, setMateri] = useState("");
  const [guru, setGuru] = useState("");
  const [hadir, setHadir] = useState("");
  const [totalSiswa, setTotalSiswa] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const key = `${grade}:${agama}`;

  useEffect(() => {
    const existing = nonMuslim[key];
    if (existing) {
      setMateri(existing.materi || "");
      setGuru(existing.guru_pembimbing || "");
      setHadir(existing.present_count ?? "");
      setTotalSiswa(existing.total_students ?? "");
      setNotes(existing.notes || "");
    } else {
      setMateri(""); setGuru(""); setHadir(""); setTotalSiswa(""); setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, selectedDate]);

  const handleSubmit = async () => {
    setError("");
    if (!materi.trim() || !guru.trim()) return setError("Materi dan guru pembimbing wajib diisi.");
    setSaving(true);
    const payload = {
      report_date: selectedDate,
      grade,
      agama,
      materi: materi.trim(),
      guru_pembimbing: guru.trim(),
      present_count: hadir === "" ? null : Number(hadir),
      total_students: totalSiswa === "" ? null : Number(totalSiswa),
      notes: notes.trim(),
      updated_at: new Date().toISOString(),
    };
    const { data, error: saveError } = await supabase.from("non_muslim_reports").upsert(payload, { onConflict: "report_date,grade,agama" }).select().single();
    setSaving(false);
    if (saveError) return setError("Gagal menyimpan. Coba lagi.");
    onSaved(key, data);
  };

  return (
    <div className="max-w-xl bg-white rounded-xl p-5 space-y-4 border border-line">
      <p className="text-xs text-muted">Pencatatan kegiatan rohani untuk siswa non-muslim, dikelompokkan per tingkat.</p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-muted">Tanggal</label>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Tingkat</label>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm">
            <option value="7">Kelas 7</option>
            <option value="8">Kelas 8</option>
            <option value="9">Kelas 9</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Agama</label>
          <select value={agama} onChange={(e) => setAgama(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm">
            <option value="protestan">Kristen Protestan</option>
            <option value="katolik">Katolik</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted">Materi / ayat yang dipelajari</label>
        <input type="text" value={materi} onChange={(e) => setMateri(e.target.value)} placeholder="Contoh: Yohanes 3:1-15" className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted">Siswa hadir</label>
          <input type="number" min="0" value={hadir} onChange={(e) => setHadir(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Jumlah siswa</label>
          <input type="number" min="0" value={totalSiswa} onChange={(e) => setTotalSiswa(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted">Guru pembimbing</label>
        <div className="mt-1">
          <TeacherPicker teachers={teachers} value={guru} onChange={setGuru} />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted">Catatan (opsional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg border border-line text-sm" />
      </div>

      {error && <p className="text-sm text-crimson">{error}</p>}

      <button onClick={handleSubmit} disabled={saving} className="w-full py-2.5 rounded-lg text-sm font-medium bg-green-deep text-cream disabled:opacity-70">
        {saving ? "Menyimpan..." : "Simpan"}
      </button>
    </div>
  );
}

// ============================= DASHBOARD (Kepala Sekolah) =============================

function DashboardView({ classes, reports, teacherAtt, nonMuslim, loading, selectedDate, setSelectedDate, lastRefresh, onManualRefresh }) {
  const absentToday = teacherAtt.filter((e) => e.status === "tidak_hadir");

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">Tanggal</label>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="px-3 py-1.5 rounded-lg border border-line text-sm" />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>Diperbarui {timeAgo(lastRefresh)}</span>
          <button onClick={onManualRefresh} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-line text-green-deep">Segarkan</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted">Memuat data...</div>
      ) : (
        <>
          <SectionCard title="Tilawah Al-Qur'an per Kelas">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map((c) => {
                const r = reports[c.name];
                return (
                  <div key={c.id} className={`rounded-xl p-4 bg-cream border ${r ? "border-green/30" : "border-line"}`}>
                    <div className="flex items-start justify-between">
                      <h3 className="text-lg font-display font-semibold text-green-deep">Kelas {c.name}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${r ? "bg-green-soft text-green-deep" : "bg-gold-soft text-gold-deep"}`}>
                        {r ? "Sudah lapor" : "Belum lapor"}
                      </span>
                    </div>
                    {r ? (
                      <div className="mt-3 space-y-1.5 text-sm text-ink">
                        <p><span className="text-muted">Surat:</span> {r.surah || "-"}</p>
                        <p><span className="text-muted">Ayat:</span> {r.ayat_range || "-"} {r.jumlah_ayat ? `(${r.jumlah_ayat} ayat)` : ""}</p>
                        <p><span className="text-muted">Kehadiran:</span> {r.present_count ?? "-"}/{r.total_students ?? "-"} siswa</p>
                        <p><span className="text-muted">Guru Pendamping:</span> {r.teacher_name || "-"}</p>
                        {r.notes && <p className="pt-1 italic text-muted">"{r.notes}"</p>}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted">Belum ada laporan untuk tanggal ini.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Guru Tidak Hadir Hari Ini" subtitle={absentToday.length === 0 ? "Tidak ada laporan ketidakhadiran guru." : `${absentToday.length} catatan ketidakhadiran`}>
            {absentToday.length > 0 && (
              <ul className="space-y-2">
                {absentToday.map((e) => (
                  <li key={e.id} className="bg-crimson-soft rounded-lg p-3 text-sm">
                    <p className="font-medium text-ink">{e.teacher_name} — Kelas {e.class_name} {e.period_label ? `· ${e.period_label}` : ""}</p>
                    <p className="text-xs mt-0.5 text-crimson">{REASON_LABELS[e.reason] || e.reason}</p>
                    {e.task_notes && <p className="text-xs mt-1 text-muted italic">Tugas: {e.task_notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Kegiatan Non-Muslim Hari Ini">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {["7", "8", "9"].flatMap((g) =>
                ["protestan", "katolik"].map((a) => {
                  const r = nonMuslim[`${g}:${a}`];
                  return (
                    <div key={`${g}:${a}`} className={`rounded-xl p-3 bg-cream border ${r ? "border-green/30" : "border-line"}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-green-deep">Kelas {g} · {a === "protestan" ? "Protestan" : "Katolik"}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${r ? "bg-green-soft text-green-deep" : "bg-gold-soft text-gold-deep"}`}>{r ? "Lapor" : "Belum"}</span>
                      </div>
                      {r && (
                        <div className="mt-2 text-xs text-ink space-y-1">
                          <p>{r.materi}</p>
                          <p className="text-muted">{r.present_count ?? "-"}/{r.total_students ?? "-"} siswa · {r.guru_pembimbing}</p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ============================= RECAP (Kepala Sekolah) =============================

function RecapView({ classes, fetchRangeData, showToast }) {
  const [mode, setMode] = useState("bulanan");
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`);
  const [startYear, setStartYear] = useState(currentAcademicStartYear());
  const [semester, setSemester] = useState(now.getMonth() + 1 >= 7 ? "ganjil" : "genap");
  const [loadingRecap, setLoadingRecap] = useState(true);
  const [reportRows, setReportRows] = useState([]);
  const [attRows, setAttRows] = useState([]);
  const [nmRows, setNmRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingRecap(true);
      let start, end;
      if (mode === "bulanan") {
        ({ start, end } = monthBounds(selectedMonth));
      } else {
        const months = semesterMonths(startYear, semester);
        start = monthBounds(months[0]).start;
        end = monthBounds(months[months.length - 1]).end;
      }
      const [r, a, n] = await Promise.all([
        fetchRangeData("reports", start, end),
        fetchRangeData("teacher_attendance", start, end),
        fetchRangeData("non_muslim_reports", start, end),
      ]);
      if (!cancelled) {
        setReportRows(r);
        setAttRows(a);
        setNmRows(n);
        setLoadingRecap(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, selectedMonth, startYear, semester, fetchRangeData]);

  const tilawahAgg = useMemo(() => {
    const perClass = {};
    classes.forEach((c) => {
      perClass[c.name] = { sessions: 0, totalAyat: 0, totalHadir: 0, totalSiswaSum: 0, attendanceSamples: 0, lastDate: null, lastSurah: "-", lastAyatRange: "-", teachers: new Set() };
    });
    reportRows.forEach((r) => {
      const agg = perClass[r.class_name];
      if (!agg) return;
      agg.sessions += 1;
      agg.totalAyat += Number(r.jumlah_ayat) || 0;
      if (r.present_count != null && r.total_students) {
        agg.totalHadir += Number(r.present_count);
        agg.totalSiswaSum += Number(r.total_students);
        agg.attendanceSamples += 1;
      }
      if (r.teacher_name) agg.teachers.add(r.teacher_name);
      if (!agg.lastDate || r.report_date >= agg.lastDate) {
        agg.lastDate = r.report_date;
        agg.lastSurah = r.surah || "-";
        agg.lastAyatRange = r.ayat_range || "-";
      }
    });
    return perClass;
  }, [reportRows, classes]);

  const attendanceAgg = useMemo(() => {
    const perTeacher = {};
    attRows.filter((e) => e.status === "tidak_hadir").forEach((e) => {
      if (!perTeacher[e.teacher_name]) {
        perTeacher[e.teacher_name] = { total: 0, sakit: 0, izin: 0, dinas_luar: 0, lainnya: 0 };
      }
      perTeacher[e.teacher_name].total += 1;
      if (perTeacher[e.teacher_name][e.reason] != null) perTeacher[e.teacher_name][e.reason] += 1;
    });
    return perTeacher;
  }, [attRows]);

  const attendanceDetailRows = useMemo(
    () => attRows.filter((e) => e.status === "tidak_hadir").sort((a, b) => (a.report_date < b.report_date ? 1 : -1)),
    [attRows]
  );

  const nmAgg = useMemo(() => {
    const groups = {};
    ["7", "8", "9"].forEach((g) => ["protestan", "katolik"].forEach((a) => {
      groups[`${g}:${a}`] = { grade: g, agama: a, sessions: 0, totalHadir: 0, totalSiswaSum: 0, attendanceSamples: 0, lastMateri: "-", teachers: new Set() };
    }));
    nmRows.forEach((r) => {
      const k = `${r.grade}:${r.agama}`;
      const agg = groups[k];
      if (!agg) return;
      agg.sessions += 1;
      if (r.present_count != null && r.total_students) {
        agg.totalHadir += Number(r.present_count);
        agg.totalSiswaSum += Number(r.total_students);
        agg.attendanceSamples += 1;
      }
      if (r.guru_pembimbing) agg.teachers.add(r.guru_pembimbing);
      agg.lastMateri = r.materi || agg.lastMateri;
    });
    return groups;
  }, [nmRows]);

  const chartData = classes.map((c, i) => ({ kelas: c.name, ayat: tilawahAgg[c.name]?.totalAyat || 0, fill: PALETTE[i % PALETTE.length] }));

  const attendanceChartData = Object.entries(attendanceAgg)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([name, v], i) => ({ guru: name, tidakHadir: v.total, fill: PALETTE[i % PALETTE.length] }));

  const periodLabel =
    mode === "bulanan"
      ? `${MONTH_NAMES_ID[Number(selectedMonth.split("-")[1]) - 1]} ${selectedMonth.split("-")[0]}`
      : semester === "ganjil"
      ? `Semester Ganjil ${startYear}/${startYear + 1} (Jul-Des ${startYear})`
      : `Semester Genap ${startYear}/${startYear + 1} (Jan-Jun ${startYear + 1})`;

  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const tilawahData = classes.map((c) => {
        const a = tilawahAgg[c.name];
        const avg = a.attendanceSamples > 0 ? Math.round((a.totalHadir / a.totalSiswaSum) * 1000) / 10 : null;
        return {
          Kelas: c.name, "Sesi Lapor": a.sessions, "Total Ayat": a.totalAyat,
          "Kehadiran Rata-rata (%)": avg ?? "-", "Surat Terakhir": a.lastSurah, "Ayat Terakhir": a.lastAyatRange,
          "Guru Pendamping": Array.from(a.teachers).join(", "),
        };
      });
      const ws1 = XLSX.utils.json_to_sheet(tilawahData);
      XLSX.utils.book_append_sheet(wb, ws1, "Rekap Tilawah");

      const attData = Object.entries(attendanceAgg).map(([name, v]) => ({
        Guru: name, "Total Tidak Hadir": v.total, Sakit: v.sakit, Izin: v.izin,
        "Dinas Luar": v.dinas_luar, Lainnya: v.lainnya,
      }));
      const ws2 = XLSX.utils.json_to_sheet(attData.length ? attData : [{ Guru: "-", "Total Tidak Hadir": 0 }]);
      XLSX.utils.book_append_sheet(wb, ws2, "Rekap Kehadiran Guru");

      const nmData = Object.values(nmAgg).map((a) => {
        const avg = a.attendanceSamples > 0 ? Math.round((a.totalHadir / a.totalSiswaSum) * 1000) / 10 : null;
        return {
          Tingkat: a.grade, Agama: a.agama === "protestan" ? "Protestan" : "Katolik", "Sesi Lapor": a.sessions,
          "Kehadiran Rata-rata (%)": avg ?? "-", "Materi Terakhir": a.lastMateri, "Guru Pembimbing": Array.from(a.teachers).join(", "),
        };
      });
      const ws3 = XLSX.utils.json_to_sheet(nmData);
      XLSX.utils.book_append_sheet(wb, ws3, "Rekap Non-Muslim");

      const filename = `Rekap_${mode === "bulanan" ? selectedMonth : `${startYear}_${semester}`}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast("Excel berhasil diunduh");
    } catch (e) {
      showToast("Gagal membuat file Excel");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 no-print">
        <div className="flex gap-2">
          <button onClick={() => setMode("bulanan")} className={`px-4 py-2 rounded-full text-sm font-medium ${mode === "bulanan" ? "bg-green-deep text-cream" : "bg-white text-green-deep border border-line"}`}>Rekap Bulanan</button>
          <button onClick={() => setMode("semester")} className={`px-4 py-2 rounded-full text-sm font-medium ${mode === "semester" ? "bg-green-deep text-cream" : "bg-white text-green-deep border border-line"}`}>Rekap Semester</button>
        </div>
        <div className="flex items-center gap-2">
          {mode === "bulanan" ? (
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="px-3 py-1.5 rounded-lg border border-line text-sm" />
          ) : (
            <>
              <select value={startYear} onChange={(e) => setStartYear(Number(e.target.value))} className="px-3 py-1.5 rounded-lg border border-line text-sm">
                {[startYear - 1, startYear, startYear + 1].map((y) => <option key={y} value={y}>{y}/{y + 1}</option>)}
              </select>
              <select value={semester} onChange={(e) => setSemester(e.target.value)} className="px-3 py-1.5 rounded-lg border border-line text-sm">
                <option value="ganjil">Ganjil (Jul-Des)</option>
                <option value="genap">Genap (Jan-Jun)</option>
              </select>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <h2 className="text-xl font-semibold font-display text-green-deep">{periodLabel}</h2>
        <div className="flex gap-2 no-print">
          <button onClick={handleExportExcel} className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-line text-green-deep">Unduh Excel</button>
          <button onClick={() => window.print()} className="px-4 py-2 rounded-lg text-sm font-medium bg-green-deep text-cream">Unduh PDF</button>
        </div>
      </div>

      {loadingRecap ? (
        <div className="text-center py-16 text-muted">Memuat rekap...</div>
      ) : (
        <>
          <SectionCard title="Diagram Ketercapaian — Total Ayat Dibaca per Kelas">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E1DCC9" />
                <XAxis dataKey="kelas" tick={{ fontSize: 10, fill: "#5C6B63" }} interval={0} angle={-45} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11, fill: "#5C6B63" }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#E1DCC9" }} />
                <Bar dataKey="ayat" name="Total Ayat" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          <SectionCard title="Rekap Tilawah per Kelas">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 680 }}>
                <thead>
                  <tr className="bg-gold-soft">
                    {["Kelas", "Sesi Lapor", "Total Ayat", "Kehadiran Rata-rata", "Surat Terakhir", "Ayat Terakhir", "Guru Pendamping"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => {
                    const a = tilawahAgg[c.name];
                    const avg = a.attendanceSamples > 0 ? Math.round((a.totalHadir / a.totalSiswaSum) * 1000) / 10 : null;
                    return (
                      <tr key={c.id} className="border-t border-line">
                        <td className="px-3 py-2 font-medium text-green-deep">{c.name}</td>
                        <td className="px-3 py-2">{a.sessions}</td>
                        <td className="px-3 py-2">{a.totalAyat}</td>
                        <td className="px-3 py-2">{avg != null ? `${avg}%` : "-"}</td>
                        <td className="px-3 py-2">{a.lastSurah}</td>
                        <td className="px-3 py-2">{a.lastAyatRange}</td>
                        <td className="px-3 py-2">{Array.from(a.teachers).join(", ") || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Rekap Kehadiran Guru" subtitle="Jumlah ketidakhadiran per guru pada periode ini">
            {attendanceChartData.length > 0 && (
              <ResponsiveContainer width="100%" height={Math.max(180, attendanceChartData.length * 34)}>
                <BarChart data={attendanceChartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E1DCC9" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#5C6B63" }} />
                  <YAxis type="category" dataKey="guru" width={160} tick={{ fontSize: 11, fill: "#5C6B63" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#E1DCC9" }} />
                  <Bar dataKey="tidakHadir" name="Tidak Hadir" radius={[0, 4, 4, 0]}>
                    {attendanceChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm" style={{ minWidth: 640 }}>
                <thead>
                  <tr className="bg-gold-soft">
                    {["Tanggal", "Kelas", "Guru", "Jam/Mapel", "Alasan", "Keterangan Tugas"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendanceDetailRows.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-4 text-center text-muted">Tidak ada catatan ketidakhadiran pada periode ini.</td></tr>
                  ) : attendanceDetailRows.map((e) => (
                    <tr key={e.id} className="border-t border-line">
                      <td className="px-3 py-2">{e.report_date}</td>
                      <td className="px-3 py-2 font-medium text-green-deep">{e.class_name}</td>
                      <td className="px-3 py-2">{e.teacher_name}</td>
                      <td className="px-3 py-2">{e.period_label || "-"}</td>
                      <td className="px-3 py-2">{REASON_LABELS[e.reason] || e.reason}</td>
                      <td className="px-3 py-2">{e.task_notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Rekap Kegiatan Non-Muslim" subtitle="Per tingkat & agama">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 640 }}>
                <thead>
                  <tr className="bg-gold-soft">
                    {["Tingkat", "Agama", "Sesi Lapor", "Kehadiran Rata-rata", "Materi Terakhir", "Guru Pembimbing"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.values(nmAgg).map((a) => {
                    const avg = a.attendanceSamples > 0 ? Math.round((a.totalHadir / a.totalSiswaSum) * 1000) / 10 : null;
                    return (
                      <tr key={`${a.grade}:${a.agama}`} className="border-t border-line">
                        <td className="px-3 py-2 font-medium text-green-deep">{a.grade}</td>
                        <td className="px-3 py-2">{a.agama === "protestan" ? "Protestan" : "Katolik"}</td>
                        <td className="px-3 py-2">{a.sessions}</td>
                        <td className="px-3 py-2">{avg != null ? `${avg}%` : "-"}</td>
                        <td className="px-3 py-2">{a.lastMateri}</td>
                        <td className="px-3 py-2">{Array.from(a.teachers).join(", ") || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ============================= KELOLA SEKOLAH (Kepala Sekolah) =============================

function ManageView({ classes, teachers, onClassesChanged, onTeachersChanged, showToast, session }) {
  const [newClassName, setNewClassName] = useState("");
  const [newClassGrade, setNewClassGrade] = useState("7");
  const [newTeacherName, setNewTeacherName] = useState("");

  const addClass = async () => {
    const name = newClassName.trim().toUpperCase();
    if (!name) return;
    const { error } = await supabase.from("classes").insert({ name, grade: newClassGrade, sort_order: classes.length + 1 });
    if (error) return showToast(error.code === "23505" ? "Kelas sudah ada" : "Gagal menambah kelas");
    setNewClassName("");
    onClassesChanged();
    showToast("Kelas ditambahkan");
  };

  const removeClass = async (id) => {
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) return showToast("Gagal menghapus kelas");
    onClassesChanged();
    showToast("Kelas dihapus");
  };

  const addTeacher = async () => {
    const name = newTeacherName.trim();
    if (!name) return;
    const { error } = await supabase.from("teachers").insert({ name });
    if (error) return showToast(error.code === "23505" ? "Nama guru sudah ada" : "Gagal menambah guru");
    setNewTeacherName("");
    onTeachersChanged();
    showToast("Guru ditambahkan");
  };

  const removeTeacher = async (id) => {
    const { error } = await supabase.from("teachers").delete().eq("id", id);
    if (error) return showToast("Gagal menghapus guru");
    onTeachersChanged();
    showToast("Guru dihapus");
  };

  const grouped = { 7: [], 8: [], 9: [] };
  classes.forEach((c) => { if (grouped[c.grade]) grouped[c.grade].push(c); });

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-1 font-display text-green-deep">Kelola Daftar Kelas</h2>
        <p className="text-sm mb-4 text-muted">Tambah atau hapus kelas. Perubahan berlaku untuk semua pengguna.</p>
        <div className="bg-white rounded-xl p-4 border border-line">
          <div className="flex gap-2 mb-4">
            <select value={newClassGrade} onChange={(e) => setNewClassGrade(e.target.value)} className="px-3 py-2 rounded-lg border border-line text-sm">
              <option value="7">Kelas 7</option>
              <option value="8">Kelas 8</option>
              <option value="9">Kelas 9</option>
            </select>
            <input type="text" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addClass()} placeholder="Contoh: 7J" className="flex-1 px-3 py-2 rounded-lg border border-line text-sm" />
            <button onClick={addClass} className="px-4 py-2 rounded-lg text-sm font-medium bg-green-deep text-cream">Tambah</button>
          </div>
          {["7", "8", "9"].map((g) => (
            <div key={g} className="mb-3">
              <p className="text-xs font-medium text-muted mb-1.5">Kelas {g}</p>
              <div className="flex flex-wrap gap-2">
                {grouped[g].map((c) => (
                  <span key={c.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-cream">
                    {c.name}
                    <button onClick={() => removeClass(c.id)} className="text-crimson text-xs font-bold">×</button>
                  </span>
                ))}
                {grouped[g].length === 0 && <span className="text-xs text-muted">Belum ada kelas</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-1 font-display text-green-deep">Kelola Guru</h2>
        <p className="text-sm mb-4 text-muted">Daftar ini muncul sebagai dropdown di form input laporan (tilawah, presensi, non-muslim).</p>
        <div className="bg-white rounded-xl p-4 border border-line">
          <div className="flex gap-2 mb-3">
            <input type="text" value={newTeacherName} onChange={(e) => setNewTeacherName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTeacher()} placeholder="Nama guru baru" className="flex-1 px-3 py-2 rounded-lg border border-line text-sm" />
            <button onClick={addTeacher} className="px-4 py-2 rounded-lg text-sm font-medium bg-green-deep text-cream">Tambah</button>
          </div>
          <ul className="space-y-1.5 max-h-64 overflow-y-auto">
            {teachers.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm bg-cream">
                <span className="text-ink">{t.name}{t.teacher_code ? <span className="text-muted"> · kode {t.teacher_code}</span> : null}</span>
                <button onClick={() => removeTeacher(t.id)} className="text-xs font-medium text-crimson">Hapus</button>
              </li>
            ))}
            {teachers.length === 0 && <li className="text-xs text-muted">Belum ada guru terdaftar</li>}
          </ul>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-1 font-display text-green-deep">Akun Kepala Sekolah</h2>
        <p className="text-sm mb-2 text-muted">Masuk sebagai: <span className="font-medium text-ink">{session?.user?.email}</span></p>
        <p className="text-xs text-muted">Untuk menambah kepala sekolah lain atau mengganti kata sandi, gunakan Supabase Studio &gt; Authentication &gt; Users (lihat README.md).</p>
      </div>
    </div>
  );
}
