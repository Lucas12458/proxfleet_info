FROM python:3.14-slim

WORKDIR /app

RUN ["touch",".env"]

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . . 

EXPOSE 8000

CMD ["python" ,"-m", "uvicorn", "api.main:app","--host", "0.0.0.0", "--port", "8000"]