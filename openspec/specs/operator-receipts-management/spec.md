# operator-receipts-management Specification

## Purpose
Provide a dashboard tab to review, filter, and preview client PDF receipts.

## Requirements

### Requirement: REQ-MNG-001 - Acesso Restrito ao Painel
O AdminDashboard MUST fornecer uma aba "Comprovantes" exclusiva para papéis `admin` e `supervisor`.

#### Scenario: Acesso permitido
- GIVEN um usuário logado como `admin` ou `supervisor`
- WHEN visualiza o AdminDashboard
- THEN a aba "Comprovantes" é exibida

#### Scenario: Acesso negado
- GIVEN um usuário com papel diferente de `admin` ou `supervisor`
- WHEN acessa o dashboard
- THEN a aba "Comprovantes" não é exibida

### Requirement: REQ-MNG-002 - Filtro e Pré-visualização
A aba de comprovantes MUST listar os registros permitindo filtrar por cliente e por data, além de pré-visualizar o PDF.

#### Scenario: Filtragem de registros
- GIVEN a aba "Comprovantes" ativa
- WHEN o usuário filtra por cliente e intervalo de datas
- THEN apenas os comprovantes correspondentes são exibidos

#### Scenario: Visualização do PDF
- GIVEN a listagem de comprovantes
- WHEN o usuário clica em um comprovante
- THEN o PDF correspondente é renderizado em tela em um modal ou painel de visualização

## Requirements added by `multichannel-customer-payment-proofs`

## ADDED Requirements
### Requirement: Secure proof workflow
The panel MUST support identity, review, 10-day quarantine countdown, restore, links, value confirmation, provenance, and failure state. Sellers MUST NOT access original PDFs; active admins/supervisors MAY access them.
#### Scenario: Seller review
- GIVEN an admitted proof
- WHEN a seller reviews it
- THEN workflow actions and PNG are shown without PDF access.
#### Scenario: Admin restoration
- GIVEN quarantine has time remaining
- WHEN an admin restores it
- THEN review resumes and one correction notification is queued.
