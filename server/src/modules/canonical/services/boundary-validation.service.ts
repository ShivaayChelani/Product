import { prisma } from '../../../config/database';

import { isCoordinateInIndia } from '../../../shared/utils/indiaGeo';

import { boundaryDatasetProvider } from './boundary-dataset.provider';



/**

 * India bbox + optional licensed polygon validation when BOUNDARY_DATA_DIR is configured.

 */

export const boundaryValidationService = {

  async validatePlace(placeId: string, lat: number, lng: number, state: string, district: string) {

    const withinIndia = isCoordinateInIndia(lat, lng);

    const admin = boundaryDatasetProvider.resolveAdministrative(lng, lat, state, district);



    const record = await prisma.placeBoundaryValidation.create({

      data: {

        placeId,

        withinIndia,

        stateValid: admin.stateValid,

        districtValid: admin.districtValid,

        method: admin.method,

        details: {

          state,

          district,

          matchedState: admin.matchedState,

          matchedDistrict: admin.matchedDistrict,

          pendingDataset: admin.pendingDataset,

          datasetStatus: boundaryDatasetProvider.getStatus(),

        },

      },

    });



    const valid =

      withinIndia &&

      (admin.stateValid !== false) &&

      (admin.districtValid !== false);



    return {

      valid,

      withinIndia,

      stateValid: admin.stateValid,

      districtValid: admin.districtValid,

      record,

      pendingAuthoritativeBoundaries: admin.pendingDataset,

    };

  },



  async validateBatch(limit = 500) {

    const places = await prisma.place.findMany({

      where: { mergedIntoId: null, latitude: { not: null }, longitude: { not: null } },

      select: { id: true, latitude: true, longitude: true, state: true, district: true },

      take: limit,

      orderBy: { updatedAt: 'desc' },

    });



    let validated = 0;

    let conflicts = 0;

    for (const p of places) {

      const r = await this.validatePlace(p.id, p.latitude!, p.longitude!, p.state, p.district);

      validated++;

      if (!r.valid) conflicts++;

    }

    return { validated, conflicts, dataset: boundaryDatasetProvider.getStatus() };

  },

};

