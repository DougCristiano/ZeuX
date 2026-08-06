package igdb

import (
	"reflect"
	"testing"
)

// TestAllowedHostsOnlyMetadataAndImageEndpoints é a trava estrutural que o
// roadmap (docs/roadmap.md, G1) exige: se alguém adicionar um host novo a
// allowedHosts, este teste falha até a lista ser revisada explicitamente
// aqui — o scraper só pode falar com metadado/imagem, nunca um host que
// poderia servir arquivo de jogo (CLAUDE.md, princípio 6).
func TestAllowedHostsOnlyMetadataAndImageEndpoints(t *testing.T) {
	want := map[string]bool{
		"api.igdb.com":    true,
		"images.igdb.com": true,
		"id.twitch.tv":    true,
	}
	if !reflect.DeepEqual(allowedHosts, want) {
		t.Fatalf("allowedHosts mudou sem revisão explícita deste teste: %v", allowedHosts)
	}
}

func TestCheckHostRejectsUnlistedHost(t *testing.T) {
	if err := checkHost("https://evil.example.com/roms/game.zip"); err == nil {
		t.Fatal("checkHost: deveria recusar um host fora da lista")
	}
}

func TestCheckHostRejectsHTTP(t *testing.T) {
	if err := checkHost("http://api.igdb.com/v4/games"); err == nil {
		t.Fatal("checkHost: deveria recusar um host permitido servido por HTTP puro")
	}
}

func TestCheckHostAcceptsAllowedHTTPSHost(t *testing.T) {
	if err := checkHost("https://api.igdb.com/v4/games"); err != nil {
		t.Fatalf("checkHost: host permitido em HTTPS deveria passar, erro: %v", err)
	}
}
