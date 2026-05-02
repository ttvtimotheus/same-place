import geopandas as gpd

gdf = gpd.read_file('src/data/regions.geojson')

# afd_pct_x und afd_pct_y zusammenführen
gdf['afd_pct'] = gdf['afd_pct_x'].combine_first(gdf['afd_pct_y'])

# Aufräumen
gdf = gdf.drop(columns=['afd_pct_x', 'afd_pct_y', 'ags_x', 'ags_y'], errors='ignore')

# Export
gdf.to_file('src/data/regions.geojson', driver='GeoJSON')

print(f"Kreise gesamt: {len(gdf)}")
print(f"Mit NSDAP-Daten: {gdf['nsdap_pct'].notna().sum()}")
print(f"Mit AfD-Daten: {gdf['afd_pct'].notna().sum()}")
print(gdf[['GEN', 'nsdap_pct', 'afd_pct']].head(10))
