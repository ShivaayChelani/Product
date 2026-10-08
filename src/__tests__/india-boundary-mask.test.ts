import { generateLeafletHtml } from '../utils/leafletMapHtml';

describe('Task 3 India boundary mask smoke', () => {
  const html = generateLeafletHtml();

  it('embeds boundary data and boundary-aware mask', () => {
    expect(html).toContain('var INDIA_BOUNDARY_RINGS = [[[['.replace('[[[[', '[[['));
    expect(html).toContain('fill-rule:evenodd');
    expect(html).toContain('L.polygon([WORLD_RING].concat(indiaMaskHoles)');
    expect(html).not.toContain('L.rectangle');
    expect(html).not.toContain('INDIA_N');
  });

  it('draws outline polylines from the boundary rings', () => {
    expect(html).toContain('INDIA_BOUNDARY_RINGS.forEach(function(ring)');
    expect(html).toContain("{ color: '#334155', weight: 1.5, interactive: false, className: 'india-mask' }");
  });

  it('interpolated rings parse as valid JSON', () => {
    const m = html.match(/var INDIA_BOUNDARY_RINGS = (\[\[\[.*?\]\]\]);/);
    expect(m).toBeTruthy();
    const rings = JSON.parse(m![1]);
    expect(rings.length).toBe(34);
    for (const ring of rings) {
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      expect(ring.length).toBeGreaterThanOrEqual(4);
      for (const [lng, lat] of ring) {
        expect(lng).toBeGreaterThanOrEqual(68);
        expect(lng).toBeLessThanOrEqual(98.5);
        expect(lat).toBeGreaterThanOrEqual(6);
        expect(lat).toBeLessThanOrEqual(37.5);
      }
    }
  });
});
