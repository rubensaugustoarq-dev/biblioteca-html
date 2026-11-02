"""Teste no Python do QGIS, sem operar o projeto aberto pelo usuário."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

try:
    from osgeo import gdal
    from qgis.core import QgsApplication, QgsCoordinateReferenceSystem, QgsMapSettings, QgsMapRendererParallelJob, QgsRasterLayer, QgsRectangle
    from qgis.PyQt.QtCore import QSize, QEventLoop
except ModuleNotFoundError:
    raise unittest.SkipTest('Este teste de integração requer o Python do QGIS.')

app = QgsApplication([], False)
app.initQgis()
script = Path(__file__).resolve().parents[1] / 'scripts' / 'exportar_ortho_qgis.py'
spec = importlib.util.spec_from_file_location('exportador', script)
exportador = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exportador)


class ExportarOrthoTests(unittest.TestCase):
    def test_limites_impedem_exportacao_mundial_e_pixel_invalido(self):
        for rectangle, pixel in [(QgsRectangle(-20037508, -20037508, 20037508, 20037508), .25),
                                  (QgsRectangle(0, 0, 100, 100), 0),
                                  (QgsRectangle(0, 0, 0, 100), .25)]:
            with self.assertRaises(ValueError):
                exportador.dimensionar(rectangle, pixel)
        self.assertEqual(exportador.dimensionar(QgsRectangle(0, 0, 100, 50), .25), (400, 200))

    def test_renderizar_recorte_exato_rgb_crs_e_compressao(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'source.tif'
            output = Path(folder) / 'output.tif'
            crs = QgsCoordinateReferenceSystem('EPSG:31979')
            dataset = gdal.GetDriverByName('GTiff').Create(str(source), 64, 64, 3)
            dataset.SetProjection(crs.toWkt())
            dataset.SetGeoTransform((630000, 1, 0, 8897300, 0, -1))
            for band, color in enumerate((40, 160, 90), 1):
                dataset.GetRasterBand(band).Fill(color)
            dataset = None
            layer = QgsRasterLayer(str(source), 'Teste sintético')
            self.assertTrue(layer.isValid())
            extent = QgsRectangle(630001.13, 8897240.12, 630060.21, 8897299.89)
            w, h = exportador.dimensionar(extent, .25)
            settings = QgsMapSettings()
            settings.setLayers([layer])
            settings.setDestinationCrs(crs)
            settings.setExtent(extent)
            settings.setOutputSize(QSize(w, h))
            job = QgsMapRendererParallelJob(settings)
            loop = QEventLoop()
            job.finished.connect(loop.quit)
            job.start()
            loop.exec()
            self.assertFalse(job.errors())
            exportador.gravar_geotiff(job.renderedImage(), settings, extent, output, layer.name())
            check = gdal.Open(str(output))
            self.assertEqual((check.RasterXSize, check.RasterYSize, check.RasterCount), (w, h, 3))
            self.assertEqual(QgsCoordinateReferenceSystem(check.GetProjection()).authid(), 'EPSG:31979')
            gt = check.GetGeoTransform()
            self.assertAlmostEqual(gt[0], extent.xMinimum(), places=7)
            self.assertAlmostEqual(gt[3], extent.yMaximum(), places=7)
            self.assertAlmostEqual(gt[0] + w * gt[1], extent.xMaximum(), places=7)
            self.assertAlmostEqual(gt[3] + h * gt[5], extent.yMinimum(), places=7)
            self.assertEqual(check.GetMetadata('IMAGE_STRUCTURE')['COMPRESSION'], 'DEFLATE')
            self.assertEqual(check.GetRasterBand(2).ReadRaster(w//2, h//2, 1, 1), bytes([160]))
            check = None
            layer = None


if __name__ == '__main__':
    unittest.main()
