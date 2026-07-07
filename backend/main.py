from fastapi import FastAPI, UploadFile, File, Form, Query, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import fitz
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import uuid
import httpx
import traceback
import os
import json
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "static/pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

qdrant_client = QdrantClient(path="./qdrant_db")
COLLECTION_NAME = "unud_research"
OLLAMA_URL = "http://localhost:11434"

if not qdrant_client.collection_exists(collection_name=COLLECTION_NAME):
    qdrant_client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=384, distance=Distance.COSINE),
    )

async def get_ollama_embedding(text: str) -> List[float]:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{OLLAMA_URL}/api/embed",
                json={"model": "all-minilm:latest", "input": text},
                timeout=30.0
            )
            if response.status_code == 200:
                return response.json()["embeddings"][0]
            
            response = await client.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={"model": "all-minilm:latest", "prompt": text},
                timeout=30.0
            )
            if response.status_code == 200:
                return response.json()["embedding"]
            
            return [0.0] * 384
        except Exception:
            return [0.0] * 384

class JournalMetadata(BaseModel):
    id: str
    title: str
    author: str
    year: int
    category: str
    theme: str
    abstract: str
    citations: int
    pdf_url: str

class ChatRequest(BaseModel):
    message: str

@app.post("/api/extract-metadata")
async def extract_metadata(file: UploadFile = File(...)):
    try:
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        sample_text = ""
        max_pages = min(len(doc), 3)
        for i in range(max_pages):
            sample_text += doc[i].get_text()
            
        if not sample_text.strip():
            return JSONResponse(
                status_code=400,
                content={"detail": "Teks digital tidak terdeteksi pada berkas PDF ini."}
            )
            
        prompt = (
            "Anda adalah asisten AI untuk ekstraksi data. Ekstrak metadata dari teks dokumen akademik berikut menjadi satu objek JSON yang valid.\n"
            "PENTING: Seluruh isi teks yang diekstrak, khususnya bagian 'abstract' (abstrak), WAJIB diterjemahkan dan ditulis dalam Bahasa Indonesia yang baik dan benar.\n\n"
            "Aturan Format JSON:\n"
            "1. Output HANYA berupa objek JSON mentah. Jangan gunakan markdown backtick (```), jangan tambahkan teks pengantar, dan jangan tambahkan teks penutup.\n"
            "2. Gunakan backslash untuk escape character jika ada tanda kutip ganda di dalam teks (contoh: \\\"teks\\\").\n\n"
            "Gunakan Key JSON berikut secara persis (jangan terjemahkan nama key-nya):\n"
            "- 'title': Judul lengkap dari dokumen (terjemahkan ke Bahasa Indonesia jika perlu).\n"
            "- 'author': Nama penulis, pisahkan dengan koma.\n"
            "- 'abstract': BACA TEKS ASLI LALU TERJEMAHKAN 100% KE BAHASA INDONESIA. DILARANG KERAS MENGGUNAKAN BAHASA INGGRIS. Jika teks asli mengandung istilah teknis (seperti rRNA/tRNA), biarkan istilahnya tapi terjemahkan kalimat penjelasnya.\n"
            "- 'year': Tahun publikasi berupa angka (contoh: 2026).\n"
            "- 'category': Wajib pilih salah satu dari: 'Penelitian', 'Pengabdian Kepada Masyarakat', 'Jurnal Internasional', 'Jurnal Internasional Bereputasi', 'Jurnal Nasional Terakreditasi (Sinta 1-5)', 'Seminar Nasional/Internasional', 'HKI'.\n"
            "- 'theme': Wajib pilih salah satu dari: 'AI & Machine Learning', 'IoT & Smart Systems', 'Keamanan Data & Kriptografi', 'Data Science', 'Rekayasa Perangkat Lunak', 'HealthTech & IoMT', 'AgriTech', 'Gamifikasi & EdTech', 'Media Digital', 'GIS', 'Blockchain'. Jika tidak ada yang pas, pilih 'Lainnya'.\n\n"
            f"KONTEN TEKS:\n{sample_text[:3000]}"
        )
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": "llama3.2",
                    "prompt": prompt,
                    "stream": False
                },
                timeout=300.0
            )
            
            raw_response = response.json()["response"].strip()
            raw_response = re.sub(r"^```json\s*", "", raw_response, flags=re.IGNORECASE)
            raw_response = re.sub(r"\s*```$", "", raw_response, flags=re.IGNORECASE)
            
            clean_json_match = re.search(r"\{.*\}", raw_response, re.DOTALL)
            if clean_json_match:
                raw_response = clean_json_match.group(0)
            
            try:
                metadata = json.loads(raw_response)
                return metadata
            except json.JSONDecodeError:
                return {
                    "title": "",
                    "author": "",
                    "abstract": "",
                    "year": 2026,
                    "category": "Penelitian",
                    "theme": "AI"
                }
            
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Gagal mengekstrak metadata otomatis: {str(e)}"}
        )

@app.post("/api/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    title: str = Form(...),
    author: str = Form(...),
    year: int = Form(...),
    category: str = Form(...),
    theme: str = Form(...),
    abstract: str = Form(...)
):
    try:
        pdf_bytes = await file.read()
        journal_id = str(uuid.uuid4())
        file_name = f"{journal_id}.pdf"
        file_path = os.path.join(UPLOAD_DIR, file_name)
        
        with open(file_path, "wb") as f:
            f.write(pdf_bytes)
            
        pdf_url = f"http://localhost:8000/static/pdfs/{file_name}"
        
        doc = fitz.open(file_path)
        full_text = ""
        for page in doc:
            full_text += page.get_text()
            
        chunks = [full_text[i:i+1000] for i in range(0, len(full_text), 800)]
        
        points = []
        for idx, chunk in enumerate(chunks):
            vector = await get_ollama_embedding(chunk)
            points.append(
                PointStruct(
                    id=str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{journal_id}-{idx}")),
                    vector=vector,
                    payload={
                        "journal_id": journal_id,
                        "title": title,
                        "author": author,
                        "year": year,
                        "category": category,
                        "theme": theme,
                        "chunk_text": chunk,
                        "abstract": abstract,
                        "pdf_url": pdf_url
                    }
                )
            )
            
        qdrant_client.upsert(collection_name=COLLECTION_NAME, points=points)
        
        return {
            "status": "success",
            "journal_id": journal_id,
            "pdf_url": pdf_url
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"detail": str(e)})

@app.get("/api/journals", response_model=List[JournalMetadata])
async def get_journals(
    search: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
    theme: Optional[str] = Query(None),
    category: Optional[str] = Query(None)
):
    try:
        scroll_results = qdrant_client.scroll(
            collection_name=COLLECTION_NAME,
            limit=500,
            with_payload=True,
            with_vectors=False
        )
        
        points = scroll_results[0]
        seen_journals = set()
        journals = []
        
        for point in points:
            payload = point.payload
            j_id = payload["journal_id"]
            
            if j_id in seen_journals:
                continue
                
            if search:
                search_lower = search.lower()
                if search_lower not in payload["title"].lower() and search_lower not in payload["author"].lower():
                    continue
            if year and year != "Semua" and str(payload["year"]) != year:
                continue
            if theme and theme != "Semua" and payload["theme"] != theme:
                continue
            if category and category != "Semua" and payload["category"] != category:
                continue
                
            seen_journals.add(j_id)
            journals.append(
                JournalMetadata(
                    id=j_id,
                    title=payload["title"],
                    author=payload["author"],
                    year=payload["year"],
                    category=payload["category"],
                    theme=payload["theme"],
                    abstract=payload["abstract"],
                    citations=0,
                    pdf_url=payload.get("pdf_url", "#")
                )
            )
            
        return journals
    except Exception as e:
        traceback.print_exc()
        return []

@app.post("/api/chat")
async def chat_rag(request: ChatRequest):
    try:
        query_vector = await get_ollama_embedding(request.message)
        
        try:
            response = qdrant_client.query_points(
                collection_name=COLLECTION_NAME,
                query=query_vector,
                limit=3
            )
            search_results = response.points
        except Exception:
            search_results = []
        
        context_chunks = []
        seen_sources = set()
        sources_metadata = []
        
        for hit in search_results:
            payload = hit.payload
            context_chunks.append(f"Judul Dokumen: {payload['title']}\nIsi Teks Konten: {payload['chunk_text']}")
            
            j_id = payload["journal_id"]
            if j_id not in seen_sources:
                seen_sources.add(j_id)
                sources_metadata.append({
                    "id": j_id,
                    "title": payload["title"],
                    "author": payload["author"],
                    "year": payload["year"],
                    "category": payload["category"],
                    "theme": payload["theme"],
                    "abstract": payload["abstract"],
                    "citations": 0,
                    "pdf_url": payload.get("pdf_url", "#")
                })
                
        context_str = "\n\n".join(context_chunks) if context_chunks else ""
        
        if context_str:
            prompt = (
                f"Anda adalah sistem pakar analisis riset Universitas Udayana yang sangat terstruktur dan profesional.\n"
                f"Tugas Anda adalah merangkum, menganalisis, dan menyintesis isi dokumen riset berdasarkan data KONTEKS yang ditemukan.\n\n"
                f"FORMAT JAWABAN WAJIB:\n"
                f"Gunakan format Markdown yang bersih dan rapi dengan struktur berikut:\n\n"
                f"### RINGKASAN ANALISIS\n"
                f"[Berikan deskripsi singkat 2-3 kalimat mengenai keterkaitan dokumen dengan pertanyaan pengguna]\n\n"
                f"### TEMUAN UTAMA & KORELASI\n"
                f"- **[Topik Kunci 1]**: Penjelasan mendalam mengenai temuan dari dokumen.\n"
                f"- **[Topik Kunci 2]**: Penjelasan mendalam mengenai temuan dari dokumen.\n\n"
                f"### INSIGHT & KESIMPULAN\n"
                f"[Berikan kesimpulan sintesis atau arah riset lanjutan yang relevan]\n\n"
                f"ATURAN TAMBAHAN:\n"
                f"- Gunakan bullet points (`- `) untuk detail agar mudah dibaca.\n"
                f"- Tebalkan kata kunci atau angka penting menggunakan `**kata**`.\n"
                f"- Berikan jarak 1 baris kosong antar-section.\n"
                f"- Jangan sebutkan kata 'Berdasarkan konteks yang diberikan' secara berulang. Langsung sintesis secara natural.\n\n"
                f"KONTEKS DOKUMEN REPOSITORI:\n{context_str}\n\n"
                f"PERTANYAAN PENGGUNA: {request.message}\n\n"
                f"JAWABAN SINTESIS TERSTRUKTUR:"
            )
        else:
            prompt = (
                f"Anda adalah sistem pakar analisis riset Universitas Udayana.\n"
                f"Pertanyaan pengguna tidak memiliki dokumen ilmiah yang relevan di database repositori saat ini.\n\n"
                f"### INFORMASI\n"
                f"Jawab dengan sopan bahwa data spesifik tidak ditemukan di repositori, lalu berikan penjelasan umum atau saran kata kunci lain yang relevan secara terstruktur menggunakan poin-poin.\n\n"
                f"PERTANYAAN PENGGUNA: {request.message}\n\n"
                f"JAWABAN TERSTRUKTUR:"
            )
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": "llama3.2",
                    "prompt": prompt,
                    "stream": False
                },
                timeout=300.0
            )
            ai_content = response.json()["response"]
            
        return {
            "role": "assistant",
            "content": ai_content,
            "sources": sources_metadata
        }
        
    except Exception as main_err:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Server Error: {str(main_err)}"}
        )