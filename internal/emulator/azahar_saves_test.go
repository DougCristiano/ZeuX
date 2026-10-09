package emulator

import (
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
)

// buildNCSD monta um .3ds mínimo: cabeçalho NCSD com a partição 0 apontando
// para um NCCH no offset `units` (em unidades de 0x200) e com o ID `pid`.
func buildNCSD(units uint32, pid uint64) []byte {
	buf := make([]byte, int(units)*azaharMediaUnit+0x200)
	copy(buf[0x100:], "NCSD")
	binary.LittleEndian.PutUint32(buf[0x120:], units)
	off := int(units) * azaharMediaUnit
	copy(buf[off+0x100:], "NCCH")
	binary.LittleEndian.PutUint64(buf[off+0x118:], pid)
	return buf
}

// Trava que o ID do programa de um .3ds é lido da partição 0 do NCSD, com o
// offset em unidades de 0x200 bytes (ncch_container.h: partitions em 0x120).
func TestAzaharProgramIDReadsPartitionZeroOfNCSD(t *testing.T) {
	const want = 0x0004000012345600
	pid, ok := azaharProgramID(bytes.NewReader(buildNCSD(2, want)))
	if !ok || pid != want {
		t.Fatalf("pid = %#x, ok=%v; esperava %#x", pid, ok, uint64(want))
	}
}

// Trava que um NCCH direto (.cxi) também tem o ID lido no mesmo offset do
// cabeçalho, sem a tabela do NCSD.
func TestAzaharProgramIDReadsDirectNCCH(t *testing.T) {
	const want = 0x0004000000ABCDEF
	buf := make([]byte, 0x200)
	copy(buf[0x100:], "NCCH")
	binary.LittleEndian.PutUint64(buf[0x118:], want)
	pid, ok := azaharProgramID(bytes.NewReader(buf))
	if !ok || pid != want {
		t.Fatalf("pid = %#x, ok=%v; esperava %#x", pid, ok, uint64(want))
	}
}

// Trava que arquivo sem assinatura NCSD/NCCH não ganha ID: um ID chutado
// apontaria para a pasta de save de outro jogo.
func TestAzaharProgramIDRejectsUnknownFiles(t *testing.T) {
	if _, ok := azaharProgramID(bytes.NewReader(make([]byte, 0x400))); ok {
		t.Error("arquivo sem magic NCSD/NCCH não deveria ter ID")
	}
	// NCSD cuja partição 0 não tem NCCH no lugar indicado.
	buf := buildNCSD(2, 0x0004000000111111)
	copy(buf[0x400+0x100:], "XXXX")
	if _, ok := azaharProgramID(bytes.NewReader(buf)); ok {
		t.Error("NCSD sem NCCH válido na partição 0 não deveria ter ID")
	}
}

// Trava que só .3ds entra na leitura do ID: o .cia guarda o ID no TMD, e o
// ZeuX não lê isso — então para ele o resultado é desconhecido.
func TestAzaharROMProgramIDOnlyForThreeDS(t *testing.T) {
	dir := t.TempDir()
	cia := filepath.Join(dir, "jogo.cia")
	if err := os.WriteFile(cia, buildNCSD(2, 0x0004000000222222), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, ok := azaharROMProgramID(cia); ok {
		t.Error(".cia não deveria ter ID lido")
	}
	three := filepath.Join(dir, "jogo.3ds")
	if err := os.WriteFile(three, buildNCSD(2, 0x0004000000222222), 0o644); err != nil {
		t.Fatal(err)
	}
	if pid, ok := azaharROMProgramID(three); !ok || pid != 0x0004000000222222 {
		t.Errorf(".3ds: pid=%#x ok=%v", pid, ok)
	}
}

// Trava a escolha da pasta do usuário: "user" ao lado do executável ganha de
// %AppData%, e sem ela o caminho é %AppData%\Azahar.
func TestAzaharUserDirPrefersUserFolderNextToExecutable(t *testing.T) {
	exe := t.TempDir()
	appData := t.TempDir()
	if got, ok := azaharUserDirIn(exe, appData); !ok || got != filepath.Join(appData, "Azahar") {
		t.Fatalf("sem pasta user: got %q ok=%v", got, ok)
	}
	if err := os.Mkdir(filepath.Join(exe, "user"), 0o755); err != nil {
		t.Fatal(err)
	}
	if got, ok := azaharUserDirIn(exe, appData); !ok || got != filepath.Join(exe, "user") {
		t.Errorf("com pasta user: got %q ok=%v", got, ok)
	}
}

// Trava que os states só entram quando o nome traz o ID deste jogo, com o
// formato do Azahar: 16 hex maiúsculos e slot de 2 dígitos.
func TestAzaharStateSlotMatchesOnlyThisGame(t *testing.T) {
	const pid = 0x0004000000ABCDEF
	if slot, ok := azaharStateSlot("0004000000ABCDEF.03.cst", pid); !ok || slot != 3 {
		t.Errorf("slot 3 deste jogo: slot=%d ok=%v", slot, ok)
	}
	for _, name := range []string{
		"0004000000123456.03.cst", // outro jogo
		"0004000000abcdef.03.cst", // hex minúsculo: o Azahar grava maiúsculo
		"0004000000ABCDEF.3.cst",  // slot sem os 2 dígitos
		"0004000000ABCDEF.03.cst.bak",
	} {
		if _, ok := azaharStateSlot(name, pid); ok {
			t.Errorf("%q não deveria casar com este jogo", name)
		}
	}
}

// Trava que o save do 3DS é a pasta title/<alto>/<baixo>/data/00000001 dentro
// de sdmc/Nintendo 3DS/<id0>/<id1>, e que a lista de saves pega arquivos de
// subpastas (o backup copia cada um).
func TestAzaharFindsSaveTreeUnderSDMC(t *testing.T) {
	user := t.TempDir()
	const pid = 0x0004000000123400
	save := filepath.Join(user, "sdmc", "Nintendo 3DS", "id0aaa", "id1bbb",
		"title", "00040000", "00123400", "data", "00000001")
	if err := os.MkdirAll(filepath.Join(save, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(save, "sub", "arq.bin"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	dir, ok := azaharSaveDataDir(user, pid)
	if !ok || dir != save {
		t.Fatalf("pasta de save = %q ok=%v", dir, ok)
	}
	files := azaharSaveFiles(dir)
	if len(files) != 1 || files[0].Name != "arq.bin" {
		t.Errorf("arquivos = %+v; esperava o arq.bin da subpasta", files)
	}
	if _, ok := azaharSaveDataDir(user, 0x0004000000999999); ok {
		t.Error("jogo sem pasta de save não deveria achar uma")
	}
}
