CREATE TABLE controller_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    vendor TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE emulator_controller_profiles (
    adapter_id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(profile_id) REFERENCES controller_profiles(id) ON DELETE CASCADE
);
