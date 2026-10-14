package model

import (
	"fmt"
	"math"
)

type APIResponse struct {
	Message string              `json:"message,omitempty"`
	Data    any                 `json:"data,omitempty"`
	Errors  map[string][]string `json:"errors,omitempty"`
}

type PaginatedResponse[T any] struct {
	Data       []T `json:"data"`
	Total      int `json:"total"`
	Page       int `json:"page"`
	PageSize   int `json:"pageSize"`
	TotalPages int `json:"totalPages"`
}

const maxPageSize = 200

// ClampPage normalizes pagination input: page < 1 → 1, pageSize < 1 → 50 (default),
// pageSize > 200 → 200 (cap). page is capped so (page-1)*pageSize, the SQL
// offset, cannot overflow: a huge page reads as an empty page, not an error.
func ClampPage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	} else if page > math.MaxInt/maxPageSize {
		page = math.MaxInt / maxPageSize
	}
	if pageSize < 1 {
		pageSize = 50
	} else if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	return page, pageSize
}

func NewPaginatedResponse[T any](items []T, total, page, pageSize int) PaginatedResponse[T] {
	page, pageSize = ClampPage(page, pageSize)
	if items == nil {
		items = []T{} // serialize as [] rather than null
	}
	totalPages := 0
	if total > 0 {
		totalPages = total / pageSize
		if total%pageSize != 0 {
			totalPages++
		}
	}
	return PaginatedResponse[T]{Data: items, Total: total, Page: page, PageSize: pageSize, TotalPages: totalPages}
}

type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationErrors is an error. Return v.Err(), not v, from functions returning error:
// an empty ValidationErrors wrapped in an error interface is non-nil.
type ValidationErrors []ValidationError

// Err returns nil when there are no validation errors, v otherwise.
func (v ValidationErrors) Err() error {
	if len(v) == 0 {
		return nil
	}
	return v
}

func (v ValidationErrors) Error() string {
	return fmt.Sprintf("%d validation error(s)", len(v))
}

func (v ValidationErrors) ToMap() map[string][]string {
	m := make(map[string][]string)
	for _, e := range v {
		m[e.Field] = append(m[e.Field], e.Message)
	}
	return m
}
