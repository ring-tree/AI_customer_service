# ---------------------------------------------------------------------------
# 知识入库：Embedding 客户端 + Chroma 向量库
# [已实现] 建客户端，[已实现] 切块入库；供 rag_app.get_graph 取 retriever
# ---------------------------------------------------------------------------
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_openai import OpenAIEmbeddings
from dotenv import load_dotenv
import os
import shutil

from modules.env_utils import read_env_value, validate_embedding_api_key

load_dotenv(override=True)

DEFAULT_EMBEDDING_BASE = "https://tokenhub.tencentmaas.com/v1"
DEFAULT_EMBEDDING_MODEL = "kinfra-text-embedding-0.6b"


# ---------------------------------------------------------------------------
# [已实现]OpenAI 兼容 Embedding（TokenHub 国内站）
# 供 Loader 向量化与检索使用；base_url 须以 /v1 结尾
# ---------------------------------------------------------------------------
def build_embeddings() -> OpenAIEmbeddings:
    """
    构建 OpenAI 兼容 Embedding 客户端（TokenHub 国内站）
    要点：
    - Key：EMBEDDING_API_KEY → HUNYUAN_API_KEY → OPENAI_API_KEY …
    - base_url：EMBEDDING_API_BASE（须以 /v1 结尾，不要带 /embeddings）
    - model：EMBEDDING_MODEL（默认 kinfra-text-embedding-0.6b）
    - check_embedding_ctx_length=False
    - model_kwargs={"encoding_format": "float"}  # TokenHub 不支持 base64
    """
    api_key = read_env_value(
        "EMBEDDING_API_KEY",
        "HUNYUAN_API_KEY",
        "TOKENHUB_API_KEY",
        "OPENAI_API_KEY",
        "DASHSCOPE_API_KEY",
    )
    validate_embedding_api_key(api_key)

    base_url = (read_env_value("EMBEDDING_API_BASE") or DEFAULT_EMBEDDING_BASE).rstrip("/")
    model = read_env_value("EMBEDDING_MODEL") or DEFAULT_EMBEDDING_MODEL
    batch_size = int(read_env_value("EMBEDDING_BATCH_SIZE") or "64")

    return OpenAIEmbeddings(
        api_key=api_key,
        base_url=base_url,
        model=model,
        chunk_size=batch_size,
        check_embedding_ctx_length=False,
        model_kwargs={"encoding_format": "float"},
    )


class Loader:
    def __init__(self):
        self.persist_directory = os.getenv("PERSISTANT_STORAGE_DIR", "./db_md")
        self.data_directory = os.getenv("DATA_DIR", "./data/md")
        self.embedding = build_embeddings()

    # 已有库则直接加载；REBUILD=True 时删库。缺库时走 [已实现] 建库。
    def get_retriever(self):
        """
        加载或重建 Chroma 向量库并返回 retriever：
        已有库且 REBUILD=False 时直接加载；否则（REBUILD=True 或库不存在）
        删除旧库后：从 data/md 加载 → 切块 → Chroma.from_documents 持久化。
        """
        db_exists = os.path.isdir(self.persist_directory) and any(
            os.scandir(self.persist_directory)
        )
        rebuild = os.getenv("REBUILD_VECTORSTORE", "False").lower() == "true"

        if db_exists and not rebuild:
            print(f"Loading existing vectorstore from {self.persist_directory}")
            vectordb = Chroma(
                persist_directory=self.persist_directory,
                embedding_function=self.embedding,
            )
            return vectordb.as_retriever()

        if db_exists and rebuild:
            print(f"REBUILD_VECTORSTORE=True, removing old DB at {self.persist_directory}")
            shutil.rmtree(self.persist_directory, ignore_errors=True)

        print(f"Building vectorstore from markdown files in {self.data_directory} ...")
        loader = DirectoryLoader(
            self.data_directory,
            glob="**/*.md",
            loader_cls=TextLoader,
            loader_kwargs={"encoding": "utf-8"},
            show_progress=True,
        )
        documents = loader.load()
        if not documents:
            raise ValueError(
                f"未在 {self.data_directory} 找到 Markdown 知识文件，请检查 DATA_DIR 配置"
            )
        print(f"Loaded {len(documents)} documents")

        splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120)
        chunks = [c for c in splitter.split_documents(documents) if c.page_content.strip()]
        if not chunks:
            raise ValueError("切块结果为空，请检查知识文件内容")
        print(f"Split into {len(chunks)} chunks; embedding & persisting to {self.persist_directory} ...")

        vectordb = Chroma.from_documents(
            documents=chunks,
            embedding=self.embedding,
            persist_directory=self.persist_directory,
        )
        print(f"Vectorstore persisted to {self.persist_directory}")
        return vectordb.as_retriever()
