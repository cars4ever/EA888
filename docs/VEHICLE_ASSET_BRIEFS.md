# Vijf Cleetus-voertuigen — visuele uitvoering 1.29.0

De stabiele IDs en technische onderzoeksrecords blijven leidend. Afbeeldingen leveren geen vermogens-, massa- of bakgegevens. De runtimekoppeling staat in `src/assets/vehicle-assets.js`; de technische resolver blijft `sim.js:rosterSpec/rosterState`.

| carId | Vaste uitvoering | Bewuste reparaties / benaderingen |
| --- | --- | --- |
| `crc12_jackstand_240` | Donkere gebruikte S13 coupé; aparte kofferklep, popupkoplampen, metalen inlaatbak en de aangeleverde haaienafbeelding op de achterruit | Achterruit uit rear_3q op de bestaande mesh geprojecteerd; aparte achterlichten; matte gebruikte lak; vier nieuwe ronde wielen |
| `eagle` | Grijze 1969 Camaro; cowl hood, smalle voorbanden, slicks, zijuitlaat, aero en twee parachutes | Originele gereconstrueerde racehardware behouden; glas afzonderlijk materiaal; wielgeometrie vervangen |
| `mullet` | Zwarte El Camino; twee turbo-inlaten, achterspoiler en wheelie bars | Dicht gegenereerde laadbak uitgehold; metalen buizen en wieliebars opnieuw opgebouwd; de bestaande turbospoelen/spoiler niet dubbel gestapeld |
| `mcflurry` | Blauwe Foxbody notchback/coupé, nummer 3 en Oreo, aluminium achterspoiler en parachute | Zijreferentie als directe liveryprojectie, geen nieuw gegenereerd logo; parachutebeugel/bag opnieuw opgebouwd; visuele dakhoogte gecorrigeerd |
| `lumberjack` | Witte bovenkant, houtnerf, roest/verweerde onderzijde, open motorruimte zonder voorbumper, zwarte wielen en open laadbak | Glas en metaal onderscheiden, laadbakbuizen toegevoegd; gegenereerde dakhoogte gecorrigeerd; patina behouden |

Alle auto's: oorspronkelijke volumetrische reconstructie, vier onafhankelijke wielnodes, voorste stuurpivots, vaste remklauwen, PBR-lak/rubber/metaal/glas. Wheelbase volgt de **bestaande gemodelleerde** onderzoeksconfiguratie; spoorbreedte en overige visuele maten zijn schattingen, geen nieuwe voertuigfeiten. Geschatte visuele dakhoogte: Mullet 1,42 m, McFlurry 1,38 m, Lumberjack 1,48 m. Geen wijziging aan de simulatiefysica.

Grenzen: dit zijn game-assets op basis van AI-referenties, geen nauwkeurige laserscans. Kleine tekstjes, bandenopschriften en details aan de niet vanuit front_3q zichtbare zijde blijven benaderingen. De zijliveryprojectie is een texturebewerking, geen geometrische reconstructie uit een tweede camerahoek. Er zijn geen Corvette- of hatchbackmodellen toegevoegd.
