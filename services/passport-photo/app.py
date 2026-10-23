import asyncio, hmac, io, os
from pathlib import Path
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import Response
from PIL import Image, ImageOps, UnidentifiedImageError
from rembg import new_session, remove
MAX_BYTES=15*1024*1024; MAX_PIXELS=40_000_000
Image.MAX_IMAGE_PIXELS=MAX_PIXELS
MODEL=os.getenv("PASSPORT_MODEL_NAME","birefnet-portrait"); MODEL_DIR=Path(os.getenv("U2NET_HOME","/models")).resolve(); MODEL_PATH=MODEL_DIR/(MODEL+".onnx")
TOKEN=os.getenv("PASSPORT_PHOTO_SERVICE_TOKEN",""); SESSION=None; LOCK=asyncio.Semaphore(1)
app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
@app.on_event("startup")
async def startup():
 global SESSION
 if len(TOKEN)<32: raise RuntimeError("PASSPORT_PHOTO_SERVICE_TOKEN must be 32+ characters")
 if not MODEL_PATH.is_file(): raise RuntimeError("Local ONNX model missing; runtime model downloads are disabled")
 os.environ["U2NET_HOME"]=str(MODEL_DIR)
 SESSION=await asyncio.to_thread(new_session,MODEL,providers=["CPUExecutionProvider"])
@app.get("/healthz")
async def health(): return {"ok":SESSION is not None,"model_ready":SESSION is not None}
@app.post("/v1/background-remove")
async def background_remove(req:Request,authorization:str|None=Header(default=None)):
 if not TOKEN or not hmac.compare_digest(authorization or "","Bearer "+TOKEN): raise HTTPException(401,detail={"code":"unauthorized"})
 ct=(req.headers.get("content-type") or "").split(";")[0].lower().strip()
 if ct not in {"image/jpeg","image/png","image/webp"}: raise HTTPException(415,detail={"code":"unsupported_image_type"})
 length=req.headers.get("content-length","")
 if length.isdigit() and int(length)>MAX_BYTES: raise HTTPException(413,detail={"code":"image_too_large"})
 body=await req.body()
 if not body or len(body)>MAX_BYTES: raise HTTPException(413,detail={"code":"image_too_large"})
 try:
  with Image.open(io.BytesIO(body)) as src:
   src.load(); im=ImageOps.exif_transpose(src)
   if im.width*im.height>MAX_PIXELS: raise HTTPException(413,detail={"code":"image_too_large"})
   b=io.BytesIO(); im.convert("RGB").save(b,format="PNG")
 except HTTPException: raise
 except (UnidentifiedImageError,OSError,Image.DecompressionBombError,Image.DecompressionBombWarning): raise HTTPException(422,detail={"code":"invalid_image"})
 try:
  async with LOCK: out=await asyncio.to_thread(remove,b.getvalue(),session=SESSION,post_process_mask=True,alpha_matting=False)
  with Image.open(io.BytesIO(out)) as cut:
   b2=io.BytesIO(); cut.convert("RGBA").save(b2,format="PNG")
  return Response(b2.getvalue(),media_type="image/png",headers={"Cache-Control":"no-store, no-cache, must-revalidate","Pragma":"no-cache","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"})
 except Exception: raise HTTPException(500,detail={"code":"inference_failed"})
