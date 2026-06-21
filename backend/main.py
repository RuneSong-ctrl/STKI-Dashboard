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
            "Analyze the following text extracted from the beginning of an academic paper. "
            "Extract the exact metadata values and output strictly a valid JSON object. "
            "The JSON must have exactly these keys: 'title', 'author', 'abstract', 'year', 'category', 'theme'.\n\n"
            "Constraints:\n"
            "1. 'title': Extracted full title of the paper.\n"
            "2. 'author': Extracted main authors formatted as a single string comma-separated.\n"
            "3. 'abstract': A clean text summary of the abstract found in the paper.\n"
            "4. 'year': Extracted publication year as an integer number. Use 2026 if not found.\n"
            "5. 'category': Must be strictly one of these values: 'Sains & Teknologi', 'Sosial Humaniora', 'Ekonomi'. Choose based on subject context.\n"
            "6. 'theme': Must be strictly one of these values: 'AI', 'Digital Media', 'GIS', 'Blockchain'. Choose the best match.\n\n"
            "Do not add any conversational markdown block text, explanations or backticks around the JSON code structure. Output raw JSON format only.\n\n"
            f"TEXT CONTENT:\n{sample_text[:4000]}"
        )
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": "llama3.2:latest",
                    "prompt": prompt,
                    "stream": False
                },
                timeout=60.0
            )
            
            raw_response = response.json()["response"].strip()
            clean_json_match = re.search(r"\{.*\}", raw_response, re.DOTALL)
            if clean_json_match:
                raw_response = clean_json_match.group(0)
                
            metadata = json.loads(raw_response)
            return metadata
            
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
                f"Anda adalah sistem expert penemu kembali informasi riset Universitas Udayana.\n"
                f"Tugas Anda adalah merangkum, menganalisis, dan menjelaskan isi penelitian kepada pengguna berdasarkan data KONTEKS yang ditemukan di bawah ini.\n"
                f"Hubungkan isi konten dokumen dengan maksud pertanyaan pengguna secara cerdas dan informatif.\n\n"
                f"KONTEKS DOKUMEN REPOSITORI:\n{context_str}\n\n"
                f"PERTANYAAN PENGGUNA: {request.message}\n\n"
                f"JAWABAN SINTESIS:"
            )
        else:
            prompt = (
                f"Anda adalah sistem expert penemu kembali informasi riset Universitas Udayana.\n"
                f"Pertanyaan pengguna tidak memiliki dokumen relevan di database.\n\n"
                f"PERTANYAAN PENGGUNA: {request.message}\n\n"
                f"JAWABAN:"
            )
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": "llama3.2:latest",
                    "prompt": prompt,
                    "stream": False
                },
                timeout=120.0
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