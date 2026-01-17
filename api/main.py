from fastapi import FastAPI
from .routers import manager,vms,users

description = """


"""
app = FastAPI(
    title="ProxfleetAPI",
    description=description,
    version="0.0.1",
   
)


app.include_router(manager.router)
app.include_router(vms.router)
app.include_router(users.router)


@app.get("/")
async def root():
    return {"message": "Hello World"}