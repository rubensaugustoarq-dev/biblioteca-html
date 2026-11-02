"""Inicia o motor local sem janela de terminal e abre a bancada no navegador."""
from pathlib import Path
import json
import os
import subprocess
import sys
import time
import urllib.request
import webbrowser

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from services.engine.version import VERSION
runtime=root/'.runtime'
runtime.mkdir(exist_ok=True)
(runtime/'temp').mkdir(exist_ok=True)
url='http://127.0.0.1:8765'


def ready():
    try:
        with urllib.request.urlopen(url+'/api/health',timeout=1) as response:
            info=json.load(response)
            return info.get('version')==VERSION and 'boundary' in info.get('capabilities',[])
    except Exception:
        return False


if not (root/'apps/web/dist/index.html').is_file():
    print('Interface não compilada. Execute Preparar Lotes SEHURB.cmd uma vez.')
    sys.exit(1)
if not ready():
    env=os.environ.copy()
    env['TEMP']=str(runtime/'temp')
    env['TMP']=env['TEMP']
    with (runtime/'server.log').open('ab') as log:
        process=subprocess.Popen([sys.executable,'-m','uvicorn','services.engine.api:app','--host','127.0.0.1','--port','8765'],
                                 cwd=root,env=env,stdout=log,stderr=log,
                                 creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        (runtime/'server.pid').write_text(str(process.pid),encoding='ascii')
    for attempt in range(80):
        if ready(): break
        if process.poll() is not None: break
        time.sleep(.25)
    if not ready():
        print('Não foi possível iniciar. Consulte .runtime/server.log ou verifique se a porta 8765 está ocupada.')
        sys.exit(1)
if '--no-browser' not in sys.argv:
    webbrowser.open(url)
print('Lotes SEHURB disponível em '+url)
