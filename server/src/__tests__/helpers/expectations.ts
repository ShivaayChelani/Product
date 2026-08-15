export function expectSuccessResponse(res: any) {
  expect(res.status).toBeLessThan(400);
  expect(res.body.success).toBe(true);
}

export function expectErrorResponse(res: any, status: number) {
  expect(res.status).toBe(status);
  expect(res.body.success).toBe(false);
}

export function expectPaginated(res: any) {
  expectSuccessResponse(res);
  expect(res.body.data).toBeDefined();
  expect(res.body.pagination).toBeDefined();
}
