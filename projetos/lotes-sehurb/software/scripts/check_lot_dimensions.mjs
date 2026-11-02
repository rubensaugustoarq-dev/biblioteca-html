import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
await build({entryPoints:['apps/web/src/features/infra/subdivision/lotDimensions.ts'],bundle:true,platform:'node',format:'esm',outfile:'.runtime/lot-dimensions-check.mjs'});
const {lotSides,LotDimensions}=await import('../.runtime/lot-dimensions-check.mjs');
const rectangle=(x,y,w=10,h=25)=>({geometry:{type:'Polygon',coordinates:[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]}});
assert.equal(lotSides([rectangle(0,0),rectangle(10,0)]).length,7,'Shared side appears once');
assert.equal(lotSides([rectangle(0,0),rectangle(11,0)]).length,8,'Equal but separate sides remain');
const reversed=rectangle(10,0);reversed.geometry.coordinates[0].reverse();
assert.equal(lotSides([rectangle(0,0),reversed]).length,7,'Independent of ring orientation');
const dims=new LotDimensions();assert.equal(dims.layer.getVisible(),false);
dims.update([rectangle(626000,8890000),rectangle(626010,8890000)]);
assert.equal(dims.source.getFeatures().length,7);
for(const feature of dims.source.getFeatures()){
 const style=dims.layer.getStyleFunction()(feature,.2),point=style.getGeometry().getCoordinates();
 assert.ok(feature.get('polygon').intersectsCoordinate(point),'Dimension is inside its lot');
 assert.match(style.getText().getText(),/^(10|25),00 m$/);
 assert.equal(style.getStroke(),null,'Labels have no dimension lines');
}
dims.layer.setVisible(true);assert.equal(dims.layer.getVisible(),true);
dims.update([]);assert.equal(dims.source.getFeatures().length,0);dims.dispose();
console.log('Cotas de lotes: divisas únicas, lados independentes, anéis invertidos, posição interna UTM e alternância passaram.');
