package emulator

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// ControllerProfile representa uma família de controle que o ZeuX consegue
// reconhecer e usar como referência para futuros mapeamentos por emulador.
// Nesta primeira versão, o perfil é um identificador estável com nome legível
// e um marcador de marca/família. O formato foi mantido simples de propósito:
// a associação com os emuladores já nasce pronta, e o mapeamento detalhado
// pode ser expandido depois sem mexer na base.
type ControllerProfile struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Vendor    string    `json:"vendor"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ControllerAssignment liga um emulador a um perfil de controle preferido.
// O ZeuX usa isto para lembrar qual família de controle a pessoa quer usar
// com cada emulador, preparando a ponte para o mapeamento fino por adapter.
type ControllerAssignment struct {
	AdapterID string `json:"adapter_id"`
	ProfileID  string `json:"profile_id,omitempty"`
}

type ControllerProfileStore struct {
	db *sql.DB
}

func NewControllerProfileStore(db *sql.DB) *ControllerProfileStore {
	return &ControllerProfileStore{db: db}
}

func defaultControllerProfiles() []ControllerProfile {
	now := time.Now().UTC()
	return []ControllerProfile{
		{ID: "xbox", Name: "Xbox", Vendor: "Microsoft", UpdatedAt: now},
		{ID: "playstation", Name: "PlayStation", Vendor: "Sony", UpdatedAt: now},
		{ID: "generic", Name: "Genérico", Vendor: "Genérico", UpdatedAt: now},
	}
}

func (s *ControllerProfileStore) ListProfiles(ctx context.Context) ([]ControllerProfile, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, vendor, updated_at
		FROM controller_profiles
		ORDER BY name COLLATE NOCASE
	`)
	if err != nil {
		return nil, fmt.Errorf("lendo perfis de controle: %w", err)
	}
	defer rows.Close()

	var profiles []ControllerProfile
	for rows.Next() {
		var p ControllerProfile
		if err := rows.Scan(&p.ID, &p.Name, &p.Vendor, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("lendo perfil de controle: %w", err)
		}
		profiles = append(profiles, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterando perfis de controle: %w", err)
	}
	return profiles, nil
}

func (s *ControllerProfileStore) SeedProfiles(ctx context.Context) error {
	for _, profile := range defaultControllerProfiles() {
		if _, err := s.db.ExecContext(ctx, `
			INSERT INTO controller_profiles (id, name, vendor, updated_at)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				name = excluded.name,
				vendor = excluded.vendor
		`, profile.ID, profile.Name, profile.Vendor, profile.UpdatedAt.Format(time.RFC3339Nano)); err != nil {
			return fmt.Errorf("semeando perfil %s: %w", profile.ID, err)
		}
	}
	return nil
}

func (s *ControllerProfileStore) GetAssignment(ctx context.Context, adapterID string) (ControllerAssignment, error) {
	var profileID sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT profile_id
		FROM emulator_controller_profiles
		WHERE adapter_id = ?
	`, adapterID).Scan(&profileID)
	if err == sql.ErrNoRows {
		return ControllerAssignment{AdapterID: adapterID}, nil
	}
	if err != nil {
		return ControllerAssignment{}, fmt.Errorf("lendo associação de controle para %s: %w", adapterID, err)
	}
	if profileID.Valid {
		return ControllerAssignment{AdapterID: adapterID, ProfileID: profileID.String}, nil
	}
	return ControllerAssignment{AdapterID: adapterID}, nil
}

func (s *ControllerProfileStore) SetAssignment(ctx context.Context, adapterID, profileID string) error {
	if profileID == "" {
		return s.ClearAssignment(ctx, adapterID)
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO emulator_controller_profiles (adapter_id, profile_id, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(adapter_id) DO UPDATE SET
			profile_id = excluded.profile_id,
			updated_at = excluded.updated_at
	`, adapterID, profileID, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		return fmt.Errorf("gravando associação de controle para %s: %w", adapterID, err)
	}
	return nil
}

func (s *ControllerProfileStore) ClearAssignment(ctx context.Context, adapterID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM emulator_controller_profiles WHERE adapter_id = ?`, adapterID)
	if err != nil {
		return fmt.Errorf("removendo associação de controle para %s: %w", adapterID, err)
	}
	return nil
}
