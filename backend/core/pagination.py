"""Pagination envelope matching the frontend's `Paginated<T>` contract.

DRF's default envelope uses snake_case keys (`page_size`, `total_pages`), so we
emit the exact camelCase shape the SPA expects.
"""
from __future__ import annotations

import math

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class CamelCasePageNumberPagination(PageNumberPagination):
    page_size_query_param = 'page_size'
    max_page_size = 200
    page_size = 20

    def get_paginated_response(self, data) -> Response:
        count = self.page.paginator.count
        page_size = self.get_page_size(self.request) or self.page_size
        total_pages = max(1, math.ceil(count / page_size)) if page_size else 1
        return Response(
            {
                'count': count,
                'page': self.page.number,
                'pageSize': page_size,
                'totalPages': total_pages,
                'results': data,
            }
        )
