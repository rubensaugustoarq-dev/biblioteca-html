"""Read-only installation check; never opens or modifies project databases."""
from pathlib import Path
import importlib,sys
root=Path(__file__).resolve().parents[1]
checks=('fastapi','uvicorn','shapely','pyproj','rasterio','numpy','PIL','reportlab','pypdf','pypdfium2','ezdxf','multipart')
failures=[]
for name in checks:
    try:importlib.import_module(name)
    except ImportError:failures.append(name)
if not (root/'apps/web/dist/index.html').is_file():failures.append('interface compilada')
if failures:
    print('Preparação incompleta: '+', '.join(failures));sys.exit(1)
print('Lotes SEHURB 1.0.0: motor e interface disponíveis. Dados de projetos preservados.')
