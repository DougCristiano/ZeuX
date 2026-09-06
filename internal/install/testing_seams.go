package install

import "net/http"

// AllowHostForTesting adiciona temporariamente um host à lista de origens
// permitidas (checkHost, download.go). Existe para que um teste — inclusive
// de outro pacote, como internal/api — possa apontar StartCore/Start a um
// httptest.Server de mentira sem depender de rede real. Chame a função
// devolvida para desfazer; nunca chamado fora de código de teste.
func AllowHostForTesting(host string) (undo func()) {
	allowedHosts[host] = true
	return func() { delete(allowedHosts, host) }
}

// SetHTTPClientForTesting troca o *http.Client que download()/fetchChecksum
// usam — normalmente por server.Client() de um httptest.NewTLSServer, que já
// confia no certificado autoassinado do servidor de teste. Chame a função
// devolvida para restaurar o cliente padrão.
func SetHTTPClientForTesting(client *http.Client) (restore func()) {
	previous := httpClient
	httpClient = client
	return func() { httpClient = previous }
}
