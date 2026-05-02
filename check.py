import geopandas as gpd
import pandas as pd
from thefuzz import process

gdf = gpd.read_file('src/data/regions.geojson')
afd = pd.read_json('src/data/afd_2025.json')
afd['ags'] = afd['ags'].astype(str)

# Altes afd_pct raus
gdf = gdf.drop(columns=['afd_pct', 'ags_x', 'ags_y', 'afd_pct_x', 'afd_pct_y'], errors='ignore')

# AGS_4 = erste 4 oder 5 Stellen je nach Länge
gdf['AGS_int'] = gdf['AGS'].astype(int).astype(str)

# Merge
gdf = gdf.merge(
    afd[['ags', 'afd_pct']],
    left_on='AGS_int',
    right_on='ags',
    how='left'
)

gdf = gdf.drop(columns=['ags', 'AGS_int'], errors='ignore')
gdf.to_file('src/data/regions.geojson', driver='GeoJSON')

print(f"Kreise gesamt: {len(gdf)}")
print(f"Mit AfD-Daten: {gdf['afd_pct'].notna().sum()}")
print(f"Mit NSDAP-Daten: {gdf['nsdap_pct'].notna().sum()}")

# Ostdeutschland check
ost = gdf[gdf['AGS'].str[:2].isin(['12','13','14','15','16'])]
print(f"\nOstdeutschland AfD-Daten: {ost['afd_pct'].notna().sum()}/{len(ost)}")
print(ost[['GEN', 'afd_pct']].head(5).to_string())
