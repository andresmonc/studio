package model

import "encoding/json"

// Nullable is a PATCH field that tells an absent key (Set=false) apart from an
// explicit null (Set=true, Value=nil), which a plain pointer cannot: both
// decode to nil. Absent means "leave unchanged", null means "reset to default".
type Nullable[T any] struct {
	Set   bool
	Value *T
}

// UnmarshalJSON is only called when the key is present, including for null.
func (n *Nullable[T]) UnmarshalJSON(data []byte) error {
	n.Set = true
	return json.Unmarshal(data, &n.Value)
}
