from uuid import uuid4
import hashlib
import warnings
import numpy as np
import rasterio
from rasterio.shutil import copy as raster_copy
from rasterio.warp import transform_bounds
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from pyproj import CRS
from .store import DomainError


def prepare(store, project_id, upload):
    folder = store.folder(project_id)
    resource_id = str(uuid4())
    original = folder / 'assets/originals' / f'{resource_id}.tif'
    digest = hashlib.sha256()
    size = 0
    with original.open('wb') as output:
        while chunk := upload.file.read(1024 * 1024):
            size += len(chunk)
            if size > 2 * 1024**3:
                raise DomainError('Limite de importação nesta versão: 2 GB por arquivo.')
            digest.update(chunk)
            output.write(chunk)
    try:
        with rasterio.open(original) as dataset:
            if dataset.driver != 'GTiff' or not dataset.crs:
                raise DomainError('Importe um GeoTIFF com sistema de coordenadas identificado.')
            if dataset.transform.is_identity:
                raise DomainError('A imagem não tem posicionamento geográfico utilizável. Georreferencie no QGIS antes de importar.')
            if dataset.width * dataset.height > 500_000_000:
                raise DomainError('Imagem excede o limite de 500 milhões de pixels desta versão.')
            project_crs = store.state(project_id)['project']['crs']['wkt']
            bounds = transform_bounds(dataset.crs, project_crs, *dataset.bounds, densify_pts=21)
            if not np.isfinite(bounds).all():
                raise DomainError('Não foi possível transformar a extensão para o CRS do projeto.')
            source_crs = CRS.from_wkt(dataset.crs.to_wkt())
            with warnings.catch_warnings():
                warnings.simplefilter('ignore')
                definition = source_crs.to_proj4()
            bands = [1, 2, 3] if dataset.count >= 3 else [1]
            sample = dataset.read(bands, out_shape=(len(bands), min(128, dataset.height), min(128, dataset.width)), masked=True)
            minimum = float(sample.min()) if sample.count() else 0
            maximum = float(sample.max()) if sample.count() else 255
            if dataset.dtypes[0] == 'uint8':
                minimum, maximum = 0, 255
            if maximum <= minimum:
                maximum = minimum + 1
            metadata = {'name': str(upload.filename or 'Ortofoto')[:160], 'sourceCrs': source_crs.to_string(),
                        'sourceWkt': source_crs.to_wkt(), 'sourceProj4': definition, 'bounds': list(bounds),
                        'affine': list(dataset.transform)[:6], 'width': dataset.width, 'height': dataset.height,
                        'bands': bands, 'min': minimum, 'max': maximum, 'opacity': 1, 'sizeBytes': size,
                        'pixelSize': list(dataset.res), 'noData': dataset.nodata if dataset.nodata is not None and np.isfinite(dataset.nodata) else None,
                        'derivedPath': f'assets/derived/{resource_id}.tif'}
        derived = folder / metadata['derivedPath']
        rotated = metadata['affine'][1] != 0 or metadata['affine'][3] != 0
        if rotated:
            with rasterio.open(original) as source, WarpedVRT(source, crs=source.crs, resampling=Resampling.bilinear) as view:
                raster_copy(view, derived, driver='COG', BLOCKSIZE=512, COMPRESS='DEFLATE', BIGTIFF='IF_SAFER')
        else:
            raster_copy(original, derived, driver='COG', BLOCKSIZE=512, COMPRESS='DEFLATE', BIGTIFF='IF_SAFER')
        with rasterio.open(derived) as display:
            metadata['displayAffine'] = list(display.transform)[:6]
        metadata['rotatedGridResampledForDisplay'] = rotated
        return {'id': resource_id, 'role': 'orthophoto', 'relativePath': original.relative_to(folder).as_posix(),
                'sha256': digest.hexdigest(), 'metadata': metadata}
    except DomainError:
        raise
    except Exception:
        raise DomainError('Não foi possível ler/preparar o GeoTIFF. Confira o arquivo e seu georreferenciamento no QGIS.')
