/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable no-unused-vars */
import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  SlidersHorizontal,
  BarChart3,
  ArrowUpRight,
  Calendar,
  Layers,
  Sparkles,
  Send,
  X,
  FileText,
  User,
  Quote,
  TrendingUp,
  PieChart as PieIcon,
  Upload,
  LayoutDashboard,
  ShieldAlert,
  Loader2,
  CheckCircle,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";

const COLORS = ["#000000", "#666666", "#CCCCCC"];

const App = () => {
  const [currentView, setCurrentView] = useState("public");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState("Semua");
  const [selectedTheme, setSelectedTheme] = useState("Semua");
  const [selectedCategory, setSelectedCategory] = useState("Semua");
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [dbData, setDbData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadAuthor, setUploadAuthor] = useState("");
  const [uploadYear, setUploadYear] = useState(2026);
  const [uploadTheme, setUploadTheme] = useState("AI");
  const [uploadCategory, setUploadCategory] = useState("Sains & Teknologi");
  const [uploadAbstract, setUploadAbstract] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const [chatHistory, setChatHistory] = useState([
    {
      role: "assistant",
      content:
        "Selamat datang di Layanan Sintesis Riset Universitas Udayana. Silakan ajukan pertanyaan mengenai publikasi ilmiah, kluster tema, atau luaran penelitian universitas yang ingin Anda telusuri secara mendalam.",
      sources: [],
    },
  ]);

  const themes = ["Semua", "AI", "Digital Media", "GIS", "Blockchain"];
  const years = ["Semua", 2022, 2023, 2024, 2025, 2026];
  const categories = [
    "Semua",
    "Sains & Teknologi",
    "Sosial Humaniora",
    "Ekonomi",
  ];

  const fetchJournals = async () => {
    try {
      const params = new URLSearchParams({
        search: searchQuery,
        year: selectedYear,
        theme: selectedTheme,
        category: selectedCategory,
      });
      const response = await fetch(
        `http://localhost:8000/api/journals?${params}`,
      );
      if (response.ok) {
        const data = await response.json();
        setDbData(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchJournals();
  }, [searchQuery, selectedYear, selectedTheme, selectedCategory]);

  const handleAutoIndexingExtract = async (file) => {
    if (!file) return;
    setIsExtracting(true);
    setUploadSuccess(false);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/api/extract-metadata", {
        method: "POST",
        body: formData,
      });
      if (response.ok) {
        const meta = await response.json();
        setUploadTitle(meta.title || "");
        setUploadAuthor(meta.author || "");
        setUploadYear(Number(meta.year) || 2026);
        setUploadCategory(meta.category || "Sains & Teknologi");
        setUploadTheme(meta.theme || "AI");
        setUploadAbstract(meta.abstract || "");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      handleAutoIndexingExtract(file);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile || !uploadTitle || !uploadAuthor) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("title", uploadTitle);
    formData.append("author", uploadAuthor);
    formData.append("year", uploadYear);
    formData.append("category", uploadCategory);
    formData.append("theme", uploadTheme);
    formData.append("abstract", uploadAbstract);

    try {
      const response = await fetch("http://localhost:8000/api/upload", {
        method: "POST",
        body: formData,
      });
      if (response.ok) {
        setUploadTitle("");
        setUploadAuthor("");
        setUploadAbstract("");
        setSelectedFile(null);
        setUploadSuccess(true);
        fetchJournals();
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    const userMessage = chatInput;
    setChatHistory((prev) => [
      ...prev,
      { role: "user", content: userMessage, sources: [] },
    ]);
    setChatInput("");
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      if (response.ok) {
        const data = await response.json();
        setChatHistory((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.content,
            sources: data.sources,
          },
        ]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const barChartData = useMemo(() => {
    const yearsList = ["2024", "2025", "2026"];
    return yearsList.map((yr) => {
      const items = dbData.filter((d) => String(d.year) === yr);
      return {
        year: yr,
        "Sains & Teknologi": items.filter(
          (i) => i.category === "Sains & Teknologi",
        ).length,
        "Sosial Humaniora": items.filter(
          (i) => i.category === "Sosial Humaniora",
        ).length,
        Ekonomi: items.filter((i) => i.category === "Ekonomi").length,
      };
    });
  }, [dbData]);

  const pieChartData = useMemo(() => {
    return categories
      .filter((c) => c !== "Semua")
      .map((cat) => {
        return {
          name: cat,
          value: dbData.filter((d) => d.category === cat).length,
        };
      });
  }, [dbData]);

  return (
    <div className="min-h-screen bg-white text-black font-mono selection:bg-black selection:text-white antialiased">
      <header className="border-b border-black sticky top-0 bg-white z-40">
        <div className="max-w-7xl mx-auto h-20 sm:h-24 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
            <span 
              onClick={() => setCurrentView("public")} 
              className="text-xl sm:text-2xl font-black tracking-tighter cursor-pointer select-none"
            >
              UNUD // REPOSITORY
            </span>
            <span className="text-[10px] uppercase tracking-widest text-neutral-400">
              Sistem Temu Kembali Informasi Ilmiah Publik
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setCurrentView(currentView === "public" ? "admin" : "public")}
              className="flex items-center gap-2 px-3 py-2 bg-neutral-100 text-black border border-black text-[11px] sm:text-xs uppercase tracking-wider font-bold hover:bg-neutral-200 transition-all cursor-pointer"
            >
              {currentView === "public" ? <ShieldAlert size={14} /> : <LayoutDashboard size={14} />}
              {currentView === "public" ? "Admin Desk" : "Public View"}
            </button>
            <button
              onClick={() => setIsAiOpen(true)}
              className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-black text-white text-[11px] sm:text-xs uppercase tracking-wider font-bold hover:bg-neutral-800 transition-all cursor-pointer"
            >
              <Sparkles size={14} />
              <span className="hidden xs:inline">Asisten</span> RAG
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {currentView === "public" ? (
          <motion.main
            key="public"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 lg:border-x border-black min-h-[calc(100vh-6rem)]"
          >
            <section className="lg:col-span-7 p-4 sm:p-8 md:p-10 space-y-12 border-b lg:border-b-0 lg:border-r border-black">
              <div className="space-y-4">
                <div className="relative border-2 border-black p-2 bg-white focus-within:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
                  <Search
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-black"
                    size={20}
                  />
                  <input
                    type="text"
                    placeholder="CARI INDEKS REPOSITORI (JUDUL / PENULIS / TOPIK)..."
                    className="w-full h-12 pl-12 pr-4 bg-transparent border-none text-xs sm:text-sm font-bold uppercase tracking-wider focus:outline-none placeholder-neutral-400"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="border border-black p-3 flex flex-col justify-between bg-white">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-widest block mb-2">
                      Tema Riset
                    </label>
                    <select
                      value={selectedTheme}
                      onChange={(e) => setSelectedTheme(e.target.value)}
                      className="bg-transparent w-full text-xs font-bold uppercase focus:outline-none cursor-pointer"
                    >
                      {themes.map((t) => (
                        <option key={t} value={t} className="font-mono text-black">
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="border border-black p-3 flex flex-col justify-between bg-white">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-widest block mb-2">
                      Tahun Publikasi
                    </label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="bg-transparent w-full text-xs font-bold uppercase focus:outline-none cursor-pointer"
                    >
                      {years.map((y) => (
                        <option key={y} value={y} className="font-mono text-black">
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="border border-black p-3 flex flex-col justify-between bg-white">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-widest block mb-2">
                      Kategori Jurnal
                    </label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="bg-transparent w-full text-xs font-bold uppercase focus:outline-none cursor-pointer"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c} className="font-mono text-black">
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex justify-between items-baseline border-b border-neutral-200 pb-4">
                  <h2 className="text-xs uppercase tracking-widest font-black text-neutral-500">
                    Koleksi Terindeks ({dbData.length})
                  </h2>
                  <span className="text-[11px] text-neutral-400 font-bold">
                    PUBLIC RECOVERY INDEX
                  </span>
                </div>

                {dbData.length === 0 ? (
                  <div className="border border-dashed border-neutral-300 py-16 text-center text-xs uppercase tracking-widest text-neutral-400 bg-neutral-50/50">
                    Tidak ada dokumen yang memenuhi kriteria pencarian publik
                  </div>
                ) : (
                  <div className="divide-y divide-black">
                    {dbData.map((item) => (
                      <article
                        key={item.id}
                        className="py-8 first:pt-0 last:pb-0 group"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                          <div className="space-y-3 flex-1">
                            <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wider">
                              <span className="border border-black px-2 py-0.5 bg-black text-white">
                                {item.category}
                              </span>
                              <span className="text-neutral-500 flex items-center gap-1">
                                <Calendar size={12} />
                                {item.year}
                              </span>
                              <span className="text-neutral-500 flex items-center gap-1">
                                <Layers size={12} />
                                {item.theme}
                              </span>
                            </div>
                            <a
                              href={item.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block group-hover:text-neutral-700 transition-colors cursor-pointer"
                            >
                              <h3 className="text-base sm:text-lg font-black tracking-tight leading-snug underline decoration-neutral-300 group-hover:decoration-black">
                                {item.title}
                              </h3>
                            </a>
                            <p className="text-xs font-bold text-neutral-600 flex items-center gap-2">
                              <User size={12} className="text-black" />{" "}
                              {item.author}
                            </p>
                            <p className="text-xs text-neutral-500 font-sans leading-relaxed text-justify max-w-2xl pt-1">
                              {item.abstract}
                            </p>
                          </div>
                          <a
                            href={item.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="self-start sm:self-center border border-black p-3 hover:bg-black hover:text-white transition-all shrink-0 flex items-center justify-center cursor-pointer"
                          >
                            <ArrowUpRight size={18} />
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <aside className="lg:col-span-5 p-4 sm:p-6 md:p-8 bg-neutral-50 space-y-8 flex flex-col justify-start">
              <div className="border border-black p-4 sm:p-6 bg-white space-y-6">
                <div className="flex items-center justify-between border-b border-black pb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">
                      Tren Publikasi Per Kategori
                    </h3>
                  </div>
                  <TrendingUp size={14} className="text-neutral-400" />
                </div>
                <div className="h-64 w-full font-mono overflow-visible">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={barChartData}
                      margin={{ top: 20, right: 15, left: -25, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                      <XAxis
                        dataKey="year"
                        tick={{
                          fontSize: 10,
                          fill: "#000",
                          fontFamily: "monospace",
                        }}
                        dy={10}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{
                          fontSize: 10,
                          fill: "#000",
                          fontFamily: "monospace",
                        }}
                        dx={-5}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#000",
                          color: "#FFF",
                          borderRadius: "0px",
                          fontFamily: "monospace",
                          fontSize: "10px",
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        wrapperStyle={{
                          fontFamily: "monospace",
                          fontSize: "8px",
                          textTransform: "uppercase",
                          paddingBottom: "15px",
                        }}
                      />
                      <Bar dataKey="Sains & Teknologi" fill="#000000" />
                      <Bar dataKey="Sosial Humaniora" fill="#666666" />
                      <Bar dataKey="Ekonomi" fill="#CCCCCC" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="border border-black p-4 sm:p-6 bg-white space-y-6">
                <div className="flex items-center justify-between border-b border-black pb-3">
                  <div className="flex items-center gap-2">
                    <PieIcon size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">
                      Distribusi Volume Makalah Ilmiah
                    </h3>
                  </div>
                </div>
                <div className="h-64 w-full font-mono flex flex-col items-center justify-center">
                  <ResponsiveContainer width="100%" height="80%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "#000",
                          color: "#FFF",
                          borderRadius: "0px",
                          fontFamily: "monospace",
                          fontSize: "10px",
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        layout="horizontal"
                        align="center"
                        wrapperStyle={{
                          fontFamily: "monospace",
                          fontSize: "8px",
                          textTransform: "uppercase",
                          paddingTop: "15px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </aside>
          </motion.main>
        ) : (
          <motion.main
            key="admin"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="max-w-7xl mx-auto lg:border-x border-black min-h-[calc(100vh-6rem)] p-4 sm:p-8 md:p-12 space-y-8 bg-neutral-50"
          >
            <div className="border-b border-black pb-4">
              <h2 className="text-xl font-black uppercase tracking-tight">Admin Control Desk</h2>
              <p className="text-xs text-neutral-500 mt-1">Sistem Otomasi Ekstraksi dan Pengindeksan Berkas Repositori</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-5 space-y-6">
                <div className="border-2 border-black p-6 bg-white space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest border-b border-black pb-2">1. Pemuatan Manuskrip Mentah</h3>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Unggah dokumen PDF asli. Sistem AI akan secara otomatis memindai lembar halaman awal untuk mendeteksi Judul, Penulis, Abstrak, dan skema kluster data terkait.
                  </p>
                  
                  <label className="flex flex-col items-center gap-3 justify-center border-2 border-dashed border-black p-8 bg-neutral-50 hover:bg-neutral-100 cursor-pointer transition-all text-center">
                    <Upload size={24} className="text-neutral-700" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {selectedFile ? selectedFile.name : "PILIH FILE PDF JURNAL"}
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>

                  {isExtracting && (
                    <div className="flex items-center gap-2 justify-center text-xs font-bold text-neutral-500 animate-pulse bg-neutral-100 p-3 border border-neutral-300">
                      <Loader2 size={14} className="animate-spin text-black" />
                      AI SEDANG MENGEKSTRAKSI METADATA...
                    </div>
                  )}

                  {uploadSuccess && (
                    <div className="flex items-center gap-2 justify-center text-xs font-bold text-emerald-700 bg-emerald-50 p-3 border border-emerald-300">
                      <CheckCircle size={14} />
                      BERKAS MANUSKRIP BERHASIL TERINDEKS
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-7">
                <form
                  onSubmit={handleUploadSubmit}
                  className="border-2 border-black p-6 bg-white space-y-4"
                >
                  <h3 className="text-xs font-black uppercase tracking-widest border-b border-black pb-2">2. Hasil Ekstraksi & Validasi Form</h3>
                  
                  <div className="space-y-4 text-xs">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Judul Manuskrip Ilmiah</label>
                      <input
                        type="text"
                        placeholder="JUDUL DOKUMEN"
                        required
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value)}
                        className="w-full p-2.5 bg-white border border-black font-mono uppercase tracking-wider focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Nama Lengkap Penulis</label>
                      <input
                        type="text"
                        placeholder="NAMA PENULIS"
                        required
                        value={uploadAuthor}
                        onChange={(e) => setUploadAuthor(e.target.value)}
                        className="w-full p-2.5 bg-white border border-black font-mono uppercase tracking-wider focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Tahun Publikasi</label>
                        <select
                          value={uploadYear}
                          onChange={(e) => setUploadYear(Number(e.target.value))}
                          className="w-full p-2.5 bg-white border border-black font-mono uppercase focus:outline-none cursor-pointer"
                        >
                          {years.filter((y) => y !== "Semua").map((y) => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Tema Riset</label>
                        <select
                          value={uploadTheme}
                          onChange={(e) => setUploadTheme(e.target.value)}
                          className="w-full p-2.5 bg-white border border-black font-mono uppercase focus:outline-none cursor-pointer"
                        >
                          {themes.filter((t) => t !== "Semua").map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Kategori Jurnal</label>
                      <select
                        value={uploadCategory}
                        onChange={(e) => setUploadCategory(e.target.value)}
                        className="w-full p-2.5 bg-white border border-black font-mono uppercase focus:outline-none cursor-pointer"
                      >
                        {categories.filter((c) => c !== "Semua").map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Abstrak Dokumen</label>
                      <textarea
                        rows={6}
                        placeholder="ABSTRAK PENELITIAN"
                        required
                        value={uploadAbstract}
                        onChange={(e) => setUploadAbstract(e.target.value)}
                        className="w-full p-2.5 bg-white border border-black font-mono text-justify focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isUploading || !selectedFile}
                    className="w-full py-3 bg-black text-white text-xs font-black uppercase tracking-widest hover:bg-neutral-800 transition-all border border-black cursor-pointer disabled:opacity-30"
                  >
                    {isUploading ? "MENGEKSTRAKSI & MENYIMPAN..." : "KONFIRMASI & INDEKS PUBLIKASI"}
                  </button>
                </form>
              </div>
            </div>
          </motion.main>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAiOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAiOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.35, ease: "easeInOut" }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-xl bg-white border-l border-black z-50 flex flex-col shadow-2xl"
            >
              <div className="h-24 px-6 sm:px-8 border-b border-black flex items-center justify-between bg-neutral-50">
                <div className="flex items-center gap-3">
                  <Sparkles size={18} />
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest">
                      Virtual Assistant
                    </h3>
                    <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">
                      Powered by Retrieval-Augmented Generation (RAG) & Ollama
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAiOpen(false)}
                  className="border border-black p-2 hover:bg-black hover:text-white transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 p-4 sm:p-8 overflow-y-auto space-y-8 bg-white font-sans">
                {chatHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div className="text-[10px] uppercase tracking-widest font-black font-mono text-neutral-400 mb-1">
                      {msg.role === "user"
                        ? "// Kueri Pengguna Publik"
                        : "// Sintesis Informasi Repositori"}
                    </div>
                    <div
                      className={`p-4 sm:p-5 max-w-[95%] sm:max-w-[90%] text-sm leading-relaxed border ${
                        msg.role === "user"
                          ? "bg-black text-white border-black font-mono text-xs uppercase tracking-wider"
                          : "bg-neutral-50 text-black border-neutral-200"
                      }`}
                    >
                      {msg.content}
                    </div>

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="w-full max-w-[95%] sm:max-w-[90%] mt-2 border border-black p-3 bg-white font-mono">
                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-neutral-400 mb-2">
                          <Quote size={10} /> Konteks Dokumen Terverifikasi:
                        </div>
                        {msg.sources.map((src) => (
                          <a
                            key={src.id}
                            href={src.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block group cursor-pointer border-b border-dashed border-neutral-200 py-2 last:border-0 hover:bg-neutral-50"
                          >
                            <h4 className="text-xs font-bold uppercase text-black group-hover:underline flex items-center gap-1">
                              <FileText
                                size={12}
                                className="shrink-0 text-neutral-400"
                              />{" "}
                              {src.title}
                            </h4>
                            <p className="text-[10px] text-neutral-400 mt-0.5">
                              {src.author} ({src.year})
                            </p>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="text-xs font-mono font-bold animate-pulse text-neutral-400">
                    // MENGEKSTRAKSI DAN MENSINTESIS DATA KORPUS...
                  </div>
                )}
              </div>

              <div className="p-4 sm:p-6 bg-neutral-50 border-t border-black">
                <div className="relative border-2 border-black bg-white p-1 flex items-center">
                  <input
                    type="text"
                    placeholder="FORMULASIKAN TOPIK ATAU PERTANYAAN RISET..."
                    className="flex-1 h-12 px-3 sm:px-4 bg-transparent text-xs font-mono font-bold uppercase tracking-wider focus:outline-none"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                  />
                  <button
                    onClick={handleSendChat}
                    className="w-12 h-12 bg-black text-white flex items-center justify-center hover:bg-neutral-800 transition-all shrink-0 cursor-pointer"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;