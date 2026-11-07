-- ============================================================================
-- FICHA-V6, STAGE 2 of 3: THE WRITE. ONE DO BLOCK, ONE TRANSACTION.
--
-- Card FICHA-V6-01 (docs/data-op-ficha-v6.md). Strategy's ruling, its words:
-- "one-row INSERT per tenant, ON CONFLICT DO NOTHING, its own document,
-- rehearsal and sha256".
--
-- WHAT IT WRITES, AND NOTHING ELSE:
--   public.form_templates  ONE row per tenant stage 1 classified INSERT: key
--                          osteopathy, version 6, is_active true, the title
--                          and the schema embedded below, ON CONFLICT
--                          (tenant_id, key, version) DO NOTHING
--   public.audit_log       ONE row per row inserted, in that row's tenant,
--                          naming it (entity_type form_template)
--
-- WHAT IT NEVER TOUCHES, asserted inside the transaction rather than promised:
-- every form_templates row that existed before it (count and one md5 over the
-- whole rows, before and after), and every other table. It updates nothing and
-- deletes nothing.
--
-- THE TABLE IS LOCKED BEFORE THE FIRST READ. form_templates is taken SHARE ROW
-- EXCLUSIVE, under a five second lock_timeout: every other write to it waits,
-- and every read goes on (a read takes ACCESS SHARE). A writer already holding
-- a lock STOPS this op cleanly instead of racing it.
--
-- A "STOP:" RAISED IN THIS FILE (psql exit 3) MEANS THE TRANSACTION ABORTED AND
-- NOTHING WAS WRITTEN. Every refusal is raised before the write, and every
-- assertion after it raises, which rolls the whole block back. psql exit 0
-- means the COMMIT below ran: the write stands.
--
-- THE CARRIES COME FROM STAGE 1, RUN IN THE SAME SITTING. The block between
-- the BASE markers is stage 1's, byte for byte, so the recomputed carries can
-- only differ if the database moved.
--
-- THE SCHEMA BELOW IS the repo's osteopathy version 6 file's "schema" member
-- (docs/data-op-ficha-v6.md names the file and pins it by sha256), and the
-- title its "title" member. The unit test parses both
-- this literal and that file with JSON.parse and compares them whole. P4 below
-- takes md5(schema::text) of the literal in Postgres and stops unless it is
-- c_v6_md5, and stops unless the literal without its x-order equals each
-- tenant's production version 5 without its x-order.
--
-- Run (stage 2 of docs/data-op-ficha-v6.md passes every carry with -v):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -v fv6_count=... -f scripts/data/ficha-v6-2-write.sql
-- ============================================================================

\pset pager off
\timing off
SET TIME ZONE 'UTC';
SET datestyle = 'ISO, YMD';
SET client_encoding = 'UTF8';
-- The step lines and the DONE line are NOTICEs. A role or database default of
-- client_min_messages above notice would hide them, and the stage 2 block would
-- then miss DONE after a write that committed. Pinned here, for this session.
SET client_min_messages = notice;

\echo ''
\echo '=== FICHA-V6, STAGE 2. ONE TRANSACTION, THE TABLE LOCKED BEFORE THE FIRST READ. ==='

BEGIN ISOLATION LEVEL READ COMMITTED;

-- PSQL DOES NOT INTERPOLATE :'var' INSIDE A DOLLAR-QUOTED BODY. The carries are
-- lifted into session settings here, in plain SQL, and read back inside the
-- block with current_setting. A carry not passed fails on this statement.
SELECT count(*) AS carries_lifted
  FROM (VALUES
    (set_config('fv6.fv6_count',    :'fv6_count',    false)),
    (set_config('fv6.fv6_tenants',  :'fv6_tenants',  false)),
    (set_config('fv6.fv6_rows',     :'fv6_rows',     false)),
    (set_config('fv6.fv6_baseline', :'fv6_baseline', false))
  ) v(x);

DO $fv6w$
DECLARE
  w_action constant text := 'staff.ficha_v6.install_template';
  w_title  constant jsonb := $fv6t$
{
  "pt": "Ficha Clínica",
  "en": "Clinical Record"
}
$fv6t$::jsonb;
  w_schema constant jsonb := $fv6s$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "description": "Ficha Médica (unified clinical record). Evolves the osteopathy template (W5-13, SPEC-ficha-medica.md sec 2): all twelve AI field keys are UNCHANGED from osteopathy v2 so the template=osteopathy ingestion selector and the twelve inbound keys map to Ficha Médica by identity (zero change on the external Make.com side). Clinical intake + evaluation form for an osteopathy episode. Field structure transcribed from the current Fisiozero osteopathy episode form (NOVO EPISODIO). PT is the source language; EN labels are provided for the bilingual UI. ai_extractable reflects João Pedro's signed-off Group A/B split (see docs/ai-ingestion/ai-extractable-audit.md §4.1): narrative free-text fields the session transcription captures are true; safety-critical/coded/structured fields stay false. Placement normalized per §2 — one flag on each writeable leaf, none on grouping containers, one flag on the bodychart field and none on its item sub-properties.",
  "type": "object",
  "required": [
    "episode_date",
    "consultation_reason"
  ],
  "x-order": [
    "episode_date",
    "weight_kg",
    "height_cm",
    "red_flags",
    "health_problems",
    "consultation_reason",
    "relief_aggravation",
    "clinical_history",
    "systems_review",
    "bodychart",
    "mobilidade",
    "mobilidade_observacoes",
    "special_tests",
    "diagnostico",
    "tratamento",
    "treatment_plan",
    "treatment_objectives",
    "observations"
  ],
  "properties": {
    "episode_date": {
      "type": "string",
      "format": "date",
      "x-label": {
        "pt": "Data do Episódio",
        "en": "Episode Date"
      },
      "x-required": true,
      "ai_extractable": false
    },
    "weight_kg": {
      "type": [
        "number",
        "null"
      ],
      "minimum": 0,
      "x-label": {
        "pt": "Peso (kg)",
        "en": "Weight (kg)"
      },
      "ai_extractable": false
    },
    "height_cm": {
      "type": [
        "number",
        "null"
      ],
      "minimum": 0,
      "x-label": {
        "pt": "Altura (cm)",
        "en": "Height (cm)"
      },
      "ai_extractable": false
    },
    "red_flags": {
      "type": [
        "string",
        "null"
      ],
      "x-label": {
        "pt": "Alertas (sinais de alarme)",
        "en": "Alerts (Red Flags)"
      },
      "x-widget": "textarea",
      "ai_extractable": false
    },
    "bodychart": {
      "type": "array",
      "x-label": {
        "pt": "Bodychart",
        "en": "Bodychart"
      },
      "x-hint": {
        "pt": "Clique no bodychart e seleccione o marcador pretendido. Pode inserir tantos pontos quantos desejar.",
        "en": "Click on the bodychart and select the desired marker. Insert as many points as needed."
      },
      "description": "Array of markers placed on the body diagram. Each marker has a type and coordinates.",
      "items": {
        "type": "object",
        "required": [
          "marker_type",
          "x",
          "y"
        ],
        "properties": {
          "marker_type": {
            "type": "string",
            "x-label": {
              "pt": "Tipo de marcador",
              "en": "Marker type"
            },
            "enum": [
              "blockage_dysfunction",
              "scar",
              "hypertonicity",
              "hypotonicity",
              "pain_radiation",
              "pain_location",
              "paresthesia",
              "rotation_right",
              "rotation_left"
            ],
            "x-enum-labels": {
              "blockage_dysfunction": {
                "pt": "Bloqueio / Disfunção",
                "en": "Blockage / Dysfunction"
              },
              "scar": {
                "pt": "Cicatriz",
                "en": "Scar"
              },
              "hypertonicity": {
                "pt": "Hipertonicidade",
                "en": "Hypertonicity"
              },
              "hypotonicity": {
                "pt": "Hipotonicidade",
                "en": "Hypotonicity"
              },
              "pain_radiation": {
                "pt": "Irradiação da dor",
                "en": "Pain radiation"
              },
              "pain_location": {
                "pt": "Local da dor",
                "en": "Pain location"
              },
              "paresthesia": {
                "pt": "Parestesia",
                "en": "Paresthesia"
              },
              "rotation_right": {
                "pt": "Rotação direita",
                "en": "Rotation right"
              },
              "rotation_left": {
                "pt": "Rotação esquerda",
                "en": "Rotation left"
              }
            }
          },
          "x": {
            "type": "number",
            "x-note": "Normalized X coordinate on the bodychart (0–1)."
          },
          "y": {
            "type": "number",
            "x-note": "Normalized Y coordinate on the bodychart (0–1)."
          },
          "view": {
            "type": [
              "string",
              "null"
            ],
            "x-note": "Which of the 4 body views the marker sits on.",
            "enum": [
              "anterior",
              "lateral_left",
              "lateral_right",
              "posterior",
              null
            ]
          }
        }
      },
      "ai_extractable": false
    },
    "observations": {
      "type": [
        "string",
        "null"
      ],
      "x-label": {
        "pt": "Observações",
        "en": "Observations"
      },
      "x-widget": "textarea",
      "ai_extractable": true
    },
    "mobilidade": {
      "type": "object",
      "x-label": {
        "pt": "Mobilidade Activa / Passiva",
        "en": "Active / Passive Mobility"
      },
      "x-widget": "mobilidade",
      "x-hint": {
        "pt": "Clique num círculo (Cervical, Dorsal, Lombar) para colocar marcadores. Ponto = Mobilidade Activa, estrela = Mobilidade Passiva. Pode inserir tantos marcadores quantos desejar por círculo.",
        "en": "Click a circle (Cervical, Dorsal, Lumbar) to place markers. Dot = Active Mobility, star = Passive Mobility. Insert as many markers as needed per circle."
      },
      "description": "Three circle diagrams (Cervical, Dorsal, Lombar). Each holds an unlimited array of markers { marker_type: 'activa'|'passiva', x, y } at 0-1 normalized coordinates.",
      "properties": {
        "cervical": {
          "type": "array",
          "x-label": {
            "pt": "Cervical",
            "en": "Cervical"
          },
          "items": {
            "type": "object",
            "required": [
              "marker_type",
              "x",
              "y"
            ],
            "properties": {
              "marker_type": {
                "type": "string",
                "enum": [
                  "activa",
                  "passiva"
                ]
              },
              "x": {
                "type": "number"
              },
              "y": {
                "type": "number"
              }
            }
          }
        },
        "dorsal": {
          "type": "array",
          "x-label": {
            "pt": "Dorsal",
            "en": "Dorsal"
          },
          "items": {
            "type": "object",
            "required": [
              "marker_type",
              "x",
              "y"
            ],
            "properties": {
              "marker_type": {
                "type": "string",
                "enum": [
                  "activa",
                  "passiva"
                ]
              },
              "x": {
                "type": "number"
              },
              "y": {
                "type": "number"
              }
            }
          }
        },
        "lombar": {
          "type": "array",
          "x-label": {
            "pt": "Lombar",
            "en": "Lumbar"
          },
          "items": {
            "type": "object",
            "required": [
              "marker_type",
              "x",
              "y"
            ],
            "properties": {
              "marker_type": {
                "type": "string",
                "enum": [
                  "activa",
                  "passiva"
                ]
              },
              "x": {
                "type": "number"
              },
              "y": {
                "type": "number"
              }
            }
          }
        }
      },
      "ai_extractable": false
    },
    "mobilidade_observacoes": {
      "type": [
        "string",
        "null"
      ],
      "x-label": {
        "pt": "Observações Mobilidade Activa / Passiva",
        "en": "Active / Passive Mobility Notes"
      },
      "x-widget": "textarea",
      "ai_extractable": false
    },
    "consultation_reason": {
      "type": "string",
      "x-label": {
        "pt": "Motivos da Consulta / Início / Contexto em que ocorre",
        "en": "Reason for Consultation / Onset / Context"
      },
      "x-required": true,
      "x-widget": "textarea",
      "ai_extractable": true
    },
    "tratamento": {
      "type": [
        "string",
        "null"
      ],
      "x-label": {
        "pt": "Tratamento",
        "en": "Treatment"
      },
      "x-widget": "textarea",
      "ai_extractable": false
    },
    "treatment_plan": {
      "type": [
        "string",
        "null"
      ],
      "x-label": {
        "pt": "Plano de Tratamento",
        "en": "Treatment Plan"
      },
      "x-widget": "textarea",
      "ai_extractable": true
    },
    "treatment_objectives": {
      "type": [
        "string",
        "null"
      ],
      "x-label": {
        "pt": "Objectivos do Tratamento",
        "en": "Treatment Objectives"
      },
      "x-widget": "textarea",
      "ai_extractable": true
    },
    "diagnostico": {
      "type": [
        "string",
        "null"
      ],
      "x-label": {
        "pt": "Diagnóstico",
        "en": "Diagnosis"
      },
      "x-widget": "textarea",
      "ai_extractable": false
    },
    "relief_aggravation": {
      "type": [
        "string",
        "null"
      ],
      "x-label": {
        "pt": "Condições Alívio / Agravamento",
        "en": "Relieving / Aggravating Factors"
      },
      "x-widget": "textarea",
      "ai_extractable": true
    },
    "systems_review": {
      "type": "object",
      "x-label": {
        "pt": "Anamnese por Sistemas",
        "en": "Systems Review"
      },
      "description": "Free-text review per body system.",
      "properties": {
        "neurological": {
          "type": [
            "string",
            "null"
          ],
          "x-label": {
            "pt": "Neurológico",
            "en": "Neurological"
          },
          "x-widget": "textarea",
          "ai_extractable": true
        },
        "cardiovascular": {
          "type": [
            "string",
            "null"
          ],
          "x-label": {
            "pt": "Cardiovascular",
            "en": "Cardiovascular"
          },
          "x-widget": "textarea",
          "ai_extractable": true
        },
        "respiratory": {
          "type": [
            "string",
            "null"
          ],
          "x-label": {
            "pt": "Respiratório",
            "en": "Respiratory"
          },
          "x-widget": "textarea",
          "ai_extractable": true
        },
        "gastrointestinal": {
          "type": [
            "string",
            "null"
          ],
          "x-label": {
            "pt": "Gastrointestinal",
            "en": "Gastrointestinal"
          },
          "x-widget": "textarea",
          "ai_extractable": true
        },
        "urological_gynecological": {
          "type": [
            "string",
            "null"
          ],
          "x-label": {
            "pt": "Urológico / Ginecológico",
            "en": "Urological / Gynecological"
          },
          "x-widget": "textarea",
          "ai_extractable": true
        },
        "endocrine": {
          "type": [
            "string",
            "null"
          ],
          "x-label": {
            "pt": "Endócrino",
            "en": "Endocrine"
          },
          "x-widget": "textarea",
          "ai_extractable": true
        }
      }
    },
    "health_problems": {
      "type": "object",
      "x-label": {
        "pt": "Problemas de Saúde",
        "en": "Health Problems"
      },
      "x-widget": "checkbox_group",
      "description": "Boolean checkbox grid from the live form, plus a free-text 'Outros' field.",
      "properties": {
        "smoker": {
          "type": "boolean",
          "x-label": {
            "pt": "Fumador",
            "en": "Smoker"
          },
          "ai_extractable": false
        },
        "pregnancy": {
          "type": "boolean",
          "x-label": {
            "pt": "Gravidez",
            "en": "Pregnancy"
          },
          "ai_extractable": false
        },
        "osteoporosis": {
          "type": "boolean",
          "x-label": {
            "pt": "Osteoporose",
            "en": "Osteoporosis"
          },
          "ai_extractable": false
        },
        "anemia": {
          "type": "boolean",
          "x-label": {
            "pt": "Anemia",
            "en": "Anemia"
          },
          "ai_extractable": false
        },
        "lupus": {
          "type": "boolean",
          "x-label": {
            "pt": "Lúpus",
            "en": "Lupus"
          },
          "ai_extractable": false
        },
        "neoplasia": {
          "type": "boolean",
          "x-label": {
            "pt": "Neoplasia",
            "en": "Neoplasia"
          },
          "ai_extractable": false
        },
        "dementia_alzheimer": {
          "type": "boolean",
          "x-label": {
            "pt": "Demência / Alzheimer",
            "en": "Dementia / Alzheimer"
          },
          "ai_extractable": false
        },
        "parkinson": {
          "type": "boolean",
          "x-label": {
            "pt": "Parkinson",
            "en": "Parkinson's"
          },
          "ai_extractable": false
        },
        "depression": {
          "type": "boolean",
          "x-label": {
            "pt": "Depressão",
            "en": "Depression"
          },
          "ai_extractable": false
        },
        "epilepsy": {
          "type": "boolean",
          "x-label": {
            "pt": "Epilepsia",
            "en": "Epilepsy"
          },
          "ai_extractable": false
        },
        "multiple_sclerosis": {
          "type": "boolean",
          "x-label": {
            "pt": "Esclerose múltipla",
            "en": "Multiple Sclerosis"
          },
          "ai_extractable": false
        },
        "rheumatoid_arthritis": {
          "type": "boolean",
          "x-label": {
            "pt": "Artrite reumatóide",
            "en": "Rheumatoid Arthritis"
          },
          "ai_extractable": false
        },
        "food_allergies": {
          "type": "boolean",
          "x-label": {
            "pt": "Alergias Alimentares",
            "en": "Food Allergies"
          },
          "ai_extractable": false
        },
        "medication_allergies": {
          "type": "boolean",
          "x-label": {
            "pt": "Alergias Medicamentosas",
            "en": "Medication Allergies"
          },
          "ai_extractable": false
        },
        "hypertension": {
          "type": "boolean",
          "x-label": {
            "pt": "Hipertensão",
            "en": "Hypertension"
          },
          "ai_extractable": false
        },
        "hypotension": {
          "type": "boolean",
          "x-label": {
            "pt": "Hipotensão",
            "en": "Hypotension"
          },
          "ai_extractable": false
        },
        "diabetes": {
          "type": "boolean",
          "x-label": {
            "pt": "Diabetes",
            "en": "Diabetes"
          },
          "ai_extractable": false
        },
        "respiratory_problems": {
          "type": "boolean",
          "x-label": {
            "pt": "Problemas Respiratórios",
            "en": "Respiratory Problems"
          },
          "ai_extractable": false
        },
        "covid_19": {
          "type": "boolean",
          "x-label": {
            "pt": "COVID-19",
            "en": "COVID-19"
          },
          "ai_extractable": false
        },
        "other": {
          "type": [
            "string",
            "null"
          ],
          "x-label": {
            "pt": "Outros",
            "en": "Other"
          },
          "x-widget": "text",
          "ai_extractable": false
        }
      }
    },
    "clinical_history": {
      "type": [
        "string",
        "null"
      ],
      "x-label": {
        "pt": "Antecedentes Clínicos / Cirurgia / Medicação",
        "en": "Clinical History / Surgery / Medication"
      },
      "x-hint": {
        "pt": "Colesterol, hipertensão, ácido úrico, diabetes, quedas, acidentes de viação",
        "en": "Cholesterol, hypertension, uric acid, diabetes, falls, road accidents"
      },
      "x-widget": "textarea",
      "ai_extractable": true
    },
    "special_tests": {
      "type": [
        "string",
        "null"
      ],
      "x-label": {
        "pt": "Testes Especiais",
        "en": "Special Tests"
      },
      "x-widget": "textarea",
      "ai_extractable": false
    }
  },
  "x-open-questions": [
    "Bodychart coordinate model: confirm whether the existing system stores normalized (0–1) coords + view, or pixel coords against a fixed image. Modelled here as normalized + 4-view enum (anterior / lateral_left / lateral_right / posterior).",
    "Are weight_kg / height_cm required for osteopathy episodes, or optional as modelled? Live form does not mark them required.",
    "CID codes — single or multiple per episode? Modelled as array.",
    "'NOTAS PESSOAIS' (private practitioner notes) appears on the physio form and is described as not shared with other users. It does NOT clearly appear on the osteopathy form. Omitted here — confirm whether osteopathy episodes also need a private-notes field, and if so whether it belongs in the clinical template or is handled separately at the app/permissions layer (likely the latter).",
    "Lupus/COVID-19 etc. label casing and accents normalized to PT-PT (e.g. 'Lúpus'). Confirm acceptable."
  ]
}
$fv6s$::jsonb;

  v_clock    timestamptz := now();
  v_key      text;
  v_from     int;
  v_to       int;
  v_v5_md5   text;
  v_v6_md5   text;
  v_ins      uuid[];
  v_ref      jsonb;
  v_car      jsonb;
  v_b_n      int;
  v_b_md5    text;
  v_ids      uuid[];
  v_tids     uuid[];
  v_a_n      int;
  v_a_md5    text;
  v_total    int;
  v_row      record;
  v_name     text;
  v_want     text;
  v_n        int;
  v_m        int;
  v_same     int;
  v_order    int;
BEGIN
  -- ==========================================================================
  -- L1. THE LOCK, before the first read. lock_timeout is local to this
  --     transaction: a lock not granted in five seconds STOPS the op.
  -- ==========================================================================
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE public.form_templates IN SHARE ROW EXCLUSIVE MODE;
  RAISE NOTICE 'L1 locked form_templates (share row exclusive); lock_timeout %', current_setting('lock_timeout');

  -- ==========================================================================
  -- P0. HAS THIS OP ALREADY RUN? Its audit action is the only answer.
  -- ==========================================================================
  SELECT count(*)::int INTO v_n FROM public.audit_log al WHERE al.action = w_action;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'STOP: FICHA-V6 has already run: % audit row(s) carry the action %. Nothing was written', v_n, w_action;
  END IF;
  RAISE NOTICE 'P0 no audit row carries %', w_action;

  -- ==========================================================================
  -- P1. EVERY SET, COMPUTED ONCE, BY STAGE 1'S OWN TEXT, UNDER THE LOCK.
  -- ==========================================================================
  WITH
-- >>> FICHA-V6 BASE BEGIN. These lines are byte-identical in stage 1 and stage 2
-- (scripts/ficha-v6-data-op.test.mjs asserts it), so the set stage 1 prints and
-- the set stage 2 writes are computed by the same text.
--
-- THE CONSTANTS. c_v5_md5 and c_v6_md5 are md5(schema::text) of the repo's
-- osteopathy version 5 and version 6 files, each taken by Postgres from a
-- literal of the file's schema; the document and the unit test hold both.
-- dow and hhmm are the database's own Lisbon clock, for R08.
k AS (
  SELECT now() AS t_now,
         extract(isodow FROM (now() AT TIME ZONE 'Europe/Lisbon'))::int AS dow,
         to_char(now() AT TIME ZONE 'Europe/Lisbon', 'HH24MI')::int AS hhmm,
         'osteopathy'::text AS c_key,
         5 AS c_from,
         6 AS c_to,
         'b109e3af926fd6f51bbf485a173d2145'::text AS c_v5_md5,
         '752bf47bf11d46a49f74e94761ecea83'::text AS c_v6_md5,
         'staff.ficha_v6.install_template'::text AS c_action
),
-- EVERY form_templates ROW, every tenant, with the md5 of its schema.
ft AS (
  SELECT f.id, f.tenant_id, f.key, f.version, f.is_active, md5(f.schema::text) AS schema_md5
    FROM public.form_templates f
),
-- EVERY TENANT, with its osteopathy versions and its version 5, if any.
ten AS (
  SELECT t.id AS tenant_id, t.slug,
         (SELECT coalesce(jsonb_agg(f.version ORDER BY f.version), '[]'::jsonb)
            FROM ft f WHERE f.tenant_id = t.id AND f.key = k.c_key) AS versions,
         (SELECT f.id FROM ft f WHERE f.tenant_id = t.id AND f.key = k.c_key AND f.version = k.c_from) AS v5_id,
         (SELECT f.is_active FROM ft f WHERE f.tenant_id = t.id AND f.key = k.c_key AND f.version = k.c_from) AS v5_active,
         (SELECT f.schema_md5 FROM ft f WHERE f.tenant_id = t.id AND f.key = k.c_key AND f.version = k.c_from) AS v5_md5,
         (SELECT count(*) FROM ft f WHERE f.tenant_id = t.id AND f.key = k.c_key AND f.version >= k.c_to)::int AS at_or_above_v6
    FROM public.tenants t
   CROSS JOIN k
),
-- WHAT STAGE 2 DOES WITH EACH TENANT. The first that applies, in this order.
cls AS (
  SELECT ten.tenant_id, ten.slug, ten.versions, ten.v5_id, ten.v5_active, ten.v5_md5, ten.at_or_above_v6,
         CASE WHEN ten.at_or_above_v6 > 0 THEN 'HOLDS VERSION 6 OR ABOVE (R04)'
              WHEN ten.v5_id IS NULL THEN 'NO OSTEOPATHY VERSION 5: LEFT ALONE'
              WHEN ten.v5_md5 IS DISTINCT FROM k.c_v5_md5 THEN 'VERSION 5 IS NOT THE REPO VERSION 5 (R03)'
              WHEN ten.v5_active IS NOT TRUE THEN 'VERSION 5 IS NOT ACTIVE (R05)'
              ELSE 'INSERT' END AS plan
    FROM ten
   CROSS JOIN k
),
-- THE WRITE SET: one tenant per row stage 2 inserts.
ins AS (
  SELECT c.tenant_id FROM cls c WHERE c.plan = 'INSERT'
),
-- THE BASELINE: every form_templates row, whole, all tenants. Stage 2 finds it
-- again under its lock, and proves after the insert that it did not move.
base AS (
  SELECT count(*)::int AS n,
         md5(coalesce(string_agg((f.*)::text, E'\n' ORDER BY f.id), '')) AS md5
    FROM public.form_templates f
),
-- ---------------------------------------------------------------------------
-- THE REFUSALS. n must be 0. control is the population the predicate read, so
-- a 0 that could not have seen anything prints VACUOUS rather than OK.
-- ---------------------------------------------------------------------------
ref AS (
  SELECT 'R01' AS code,
         'nothing to write: no tenant holds the repo osteopathy version 5 without a version 6' AS label,
         (CASE WHEN (SELECT count(*) FROM ins) = 0 THEN 1 ELSE 0 END)::int AS n,
         (SELECT count(*) FROM ten)::int AS control
  UNION ALL
  SELECT 'R02', 'FICHA-V6 has already run (its audit action)',
         (SELECT count(*) FROM public.audit_log al CROSS JOIN k WHERE al.action = k.c_action)::int,
         (SELECT count(*) FROM public.audit_log al)::int
  UNION ALL
  SELECT 'R03', 'a tenant holds an osteopathy version 5 whose schema md5 is not the repo version 5: the premise is wrong, strategy rules',
         (SELECT count(*) FROM ten CROSS JOIN k WHERE ten.v5_id IS NOT NULL AND ten.v5_md5 IS DISTINCT FROM k.c_v5_md5)::int,
         (SELECT count(*) FROM ten WHERE ten.v5_id IS NOT NULL)::int
  UNION ALL
  SELECT 'R04', 'an osteopathy row of version 6 or above already exists',
         (SELECT count(*) FROM ft CROSS JOIN k WHERE ft.key = k.c_key AND ft.version >= k.c_to)::int,
         (SELECT count(*) FROM ft CROSS JOIN k WHERE ft.key = k.c_key)::int
  UNION ALL
  SELECT 'R05', 'a tenant holds an osteopathy version 5 that is not active, so a version 6 would change more than the order',
         (SELECT count(*) FROM ten WHERE ten.v5_id IS NOT NULL AND ten.v5_active IS NOT TRUE)::int,
         (SELECT count(*) FROM ten WHERE ten.v5_id IS NOT NULL)::int
  UNION ALL
  SELECT 'R06', 'the unique key on (tenant_id, key, version) that ON CONFLICT names is missing',
         (CASE WHEN EXISTS (
                 SELECT 1 FROM pg_catalog.pg_index i
                  WHERE i.indrelid = 'public.form_templates'::regclass
                    AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL
                    AND i.indnkeyatts = 3
                    AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
                           FROM pg_catalog.pg_attribute a
                          WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey))
                        = ARRAY['key', 'tenant_id', 'version'])
               THEN 0 ELSE 1 END)::int,
         (SELECT count(*) FROM pg_catalog.pg_index i WHERE i.indrelid = 'public.form_templates'::regclass)::int
  UNION ALL
  -- A trigger the system did not create would run code the write whitelist does
  -- not name, inside the committed transaction. The control is every trigger on
  -- the two tables, the foreign-key constraint triggers included.
  SELECT 'R07', 'a trigger the system did not create sits on form_templates or audit_log',
         (SELECT count(*) FROM pg_catalog.pg_trigger t
           WHERE t.tgrelid IN ('public.form_templates'::regclass, 'public.audit_log'::regclass)
             AND NOT t.tgisinternal)::int,
         (SELECT count(*) FROM pg_catalog.pg_trigger t
           WHERE t.tgrelid IN ('public.form_templates'::regclass, 'public.audit_log'::regclass))::int
  UNION ALL
  -- The clinics' weekday table, read on the database's own clock: open Monday to
  -- Friday 08:00 to 21:00 and Saturday 08:00 to 13:00, Lisbon time; closed
  -- Sunday. The control is the Lisbon weekday times 10000 plus HHMM.
  SELECT 'R08', 'the clinics are open now by the database Lisbon clock (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00)',
         (CASE WHEN k.dow BETWEEN 1 AND 5 AND k.hhmm >= 800 AND k.hhmm < 2100 THEN 1
               WHEN k.dow = 6 AND k.hhmm >= 800 AND k.hhmm < 1300 THEN 1
               ELSE 0 END)::int,
         (k.dow * 10000 + k.hhmm)::int
    FROM k
),
-- THE CARRIES. Four names, none inside another. Stage 2 is handed each one and
-- refuses if any reads differently under its lock.
car AS (
  SELECT 1 AS ord, 'fv6_count'::text AS carry, (SELECT count(*) FROM ins)::text AS value
  UNION ALL
  SELECT 2, 'fv6_tenants', (SELECT md5(coalesce(string_agg(i.tenant_id::text, ',' ORDER BY i.tenant_id), '')) FROM ins i)
  UNION ALL
  SELECT 3, 'fv6_rows', (SELECT b.n::text FROM base b)
  UNION ALL
  SELECT 4, 'fv6_baseline', (SELECT b.md5 FROM base b)
)
-- <<< FICHA-V6 BASE END.
  SELECT (SELECT k.c_key FROM k), (SELECT k.c_from FROM k), (SELECT k.c_to FROM k),
         (SELECT k.c_v5_md5 FROM k), (SELECT k.c_v6_md5 FROM k),
         (SELECT coalesce(array_agg(i.tenant_id ORDER BY i.tenant_id), '{}'::uuid[]) FROM ins i),
         (SELECT jsonb_agg(jsonb_build_object('code', r.code, 'label', r.label, 'n', r.n, 'control', r.control) ORDER BY r.code) FROM ref r),
         (SELECT jsonb_object_agg(c.carry, c.value) FROM car c),
         (SELECT b.n FROM base b), (SELECT b.md5 FROM base b)
    INTO v_key, v_from, v_to, v_v5_md5, v_v6_md5, v_ins, v_ref, v_car, v_b_n, v_b_md5;
  RAISE NOTICE 'P1 % tenant(s) to write; % form_templates row(s) before the write', cardinality(v_ins), v_b_n;

  -- ==========================================================================
  -- P2. EVERY REFUSAL stage 1 printed, raised here before any write.
  -- ==========================================================================
  IF jsonb_array_length(v_ref) <> 8 THEN
    RAISE EXCEPTION 'STOP: the BASE computed % refusal(s), not 8. Nothing was written', jsonb_array_length(v_ref);
  END IF;
  FOR v_row IN
    SELECT e ->> 'code' AS code, e ->> 'label' AS label, (e ->> 'n')::int AS n, (e ->> 'control')::int AS control
      FROM jsonb_array_elements(v_ref) e ORDER BY e ->> 'code'
  LOOP
    RAISE NOTICE 'P2 % n % control %', v_row.code, v_row.n, v_row.control;
    IF v_row.n <> 0 THEN
      RAISE EXCEPTION 'STOP: % refuses: %. Nothing was written', v_row.code, v_row.label;
    END IF;
  END LOOP;

  -- ==========================================================================
  -- P3. THE CARRIES: each one stage 1 printed must read the same under the lock.
  --     The baseline among them: the count and the md5 of every row.
  -- ==========================================================================
  FOREACH v_name IN ARRAY ARRAY['fv6_count', 'fv6_tenants', 'fv6_rows', 'fv6_baseline'] LOOP
    v_want := current_setting('fv6.' || v_name);
    IF v_want IS DISTINCT FROM (v_car ->> v_name) THEN
      RAISE EXCEPTION 'STOP: carry % reads % now and stage 1 printed %. The database moved since stage 1. Nothing was written',
        v_name, v_car ->> v_name, v_want;
    END IF;
  END LOOP;
  RAISE NOTICE 'P3 all four carries match stage 1: % tenant(s), % row(s), baseline %', v_car ->> 'fv6_count', v_b_n, v_b_md5;

  -- ==========================================================================
  -- P4. THE LITERAL ABOVE IS THE v6 THE DOCUMENT NAMES, AND IT IS EACH TENANT'S
  --     PRODUCTION v5 WITH ONLY ITS x-order CHANGED.
  -- ==========================================================================
  IF md5(w_schema::text) IS DISTINCT FROM v_v6_md5 THEN
    RAISE EXCEPTION 'STOP: the schema this file embeds reads md5 %, not the expected version 6 md5 %. Nothing was written',
      md5(w_schema::text), v_v6_md5;
  END IF;
  SELECT count(*)::int,
         count(*) FILTER (WHERE (f.schema - 'x-order') = (w_schema - 'x-order'))::int,
         count(*) FILTER (WHERE (f.schema -> 'x-order') IS NOT DISTINCT FROM (w_schema -> 'x-order'))::int
    INTO v_m, v_same, v_order
    FROM public.form_templates f
   WHERE f.tenant_id = ANY (v_ins) AND f.key = v_key AND f.version = v_from;
  IF v_m <> cardinality(v_ins) OR v_same <> v_m OR v_order <> 0 THEN
    RAISE EXCEPTION 'STOP: of % tenant(s) to write, % version 5 row(s) read, % equal to the embedded schema without its x-order (want all), % with its x-order already (want 0). Nothing was written',
      cardinality(v_ins), v_m, v_same, v_order;
  END IF;
  RAISE NOTICE 'P4 the embedded schema reads md5 %; each version 5 equals it but for its x-order (% row(s))', v_v6_md5, v_m;

  -- ==========================================================================
  -- W1. THE WRITE: one row per tenant, ON CONFLICT DO NOTHING, its count asserted.
  -- ==========================================================================
  WITH w AS (
    INSERT INTO public.form_templates (tenant_id, key, version, title, schema, is_active)
    SELECT t.tid, v_key, v_to, w_title, w_schema, true
      FROM unnest(v_ins) AS t(tid)
        ON CONFLICT (tenant_id, key, version) DO NOTHING
    RETURNING id, tenant_id
  )
  SELECT coalesce(array_agg(w.id ORDER BY w.tenant_id), '{}'::uuid[]),
         coalesce(array_agg(w.tenant_id ORDER BY w.tenant_id), '{}'::uuid[]),
         count(*)::int
    INTO v_ids, v_tids, v_n
    FROM w;
  IF v_n <> cardinality(v_ins) OR v_n::text <> current_setting('fv6.fv6_count') OR v_tids IS DISTINCT FROM v_ins THEN
    RAISE EXCEPTION 'STOP: W1 inserted % row(s); stage 1 classified % and the BASE % tenant(s). Nothing was written',
      v_n, current_setting('fv6.fv6_count'), cardinality(v_ins);
  END IF;
  RAISE NOTICE 'W1 inserted % row(s), osteopathy version %', v_n, v_to;

  -- ==========================================================================
  -- A1. EACH INSERTED ROW READS BACK AS THE v6 THE DOCUMENT NAMES.
  -- ==========================================================================
  SELECT count(*)::int INTO v_m
    FROM public.form_templates f
   WHERE f.id = ANY (v_ids) AND f.key = v_key AND f.version = v_to AND f.is_active
     AND md5(f.schema::text) = v_v6_md5 AND f.schema = w_schema AND f.title = w_title;
  IF v_m <> v_n THEN
    RAISE EXCEPTION 'STOP: A1 read back % of % inserted row(s) as the version 6 this file embeds. Nothing was written', v_m, v_n;
  END IF;
  RAISE NOTICE 'A1 every inserted row reads md5 % and the embedded title, active', v_v6_md5;

  -- ==========================================================================
  -- A2. NO OTHER ROW MOVED: every row but the inserted ones equals the baseline.
  -- ==========================================================================
  SELECT count(*)::int, md5(coalesce(string_agg((f.*)::text, E'\n' ORDER BY f.id), ''))
    INTO v_a_n, v_a_md5
    FROM public.form_templates f
   WHERE NOT (f.id = ANY (v_ids));
  SELECT count(*)::int INTO v_total FROM public.form_templates f;
  IF v_a_n <> v_b_n OR v_a_md5 IS DISTINCT FROM v_b_md5 OR v_total <> v_b_n + v_n THEN
    RAISE EXCEPTION 'STOP: A2 a form_templates row the op did not insert moved: % row(s) md5 % now, % row(s) md5 % before; total %. Nothing was written',
      v_a_n, v_a_md5, v_b_n, v_b_md5, v_total;
  END IF;
  RAISE NOTICE 'A2 the other % row(s) unchanged, md5 %; total %', v_a_n, v_a_md5, v_total;

  -- ==========================================================================
  -- A3. THE VERSION NEW FICHAS PICK (apps/web/lib/clinical/records.ts: the
  --     active rows of the key, highest version) is now each inserted row.
  -- ==========================================================================
  SELECT count(*)::int INTO v_m
    FROM unnest(v_ids, v_tids) AS w(id, tid)
   WHERE w.id = (SELECT f.id FROM public.form_templates f
                  WHERE f.tenant_id = w.tid AND f.key = v_key AND f.is_active
                  ORDER BY f.version DESC LIMIT 1);
  IF v_m <> v_n THEN
    RAISE EXCEPTION 'STOP: A3 the picker reads the inserted row in % of % tenant(s). Nothing was written', v_m, v_n;
  END IF;
  RAISE NOTICE 'A3 the picker reads version % in every tenant written (%)', v_to, v_m;

  -- ==========================================================================
  -- THE AUDIT ROWS: one per inserted row, in its own tenant, naming it. Ids,
  -- counts and md5s only.
  -- ==========================================================================
  INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  SELECT w.tid, NULL::uuid, w_action, 'form_template', w.id, jsonb_build_object(
    'card', 'FICHA-V6-01',
    'source', 'data_op_ficha_v6',
    'ruling', 'strategy: FICHA-ORDER-01 v6 on the Tier C list, one-row INSERT per tenant, ON CONFLICT DO NOTHING',
    'clock', v_clock,
    'key', v_key,
    'version', v_to,
    'from_version', v_from,
    'schema_md5', v_v6_md5,
    'v5_schema_md5', v_v5_md5,
    'carries', v_car,
    'inserted_total', v_n,
    'baseline', jsonb_build_object('rows', v_b_n, 'md5', v_b_md5)
  )
    FROM unnest(v_ids, v_tids) AS w(id, tid);
  GET DIAGNOSTICS v_m = ROW_COUNT;
  IF v_m <> v_n OR (SELECT count(*) FROM public.audit_log al WHERE al.action = w_action) <> v_n THEN
    RAISE EXCEPTION 'STOP: % audit row(s) written for % inserted row(s). Nothing was written', v_m, v_n;
  END IF;

  RAISE NOTICE 'FICHA-V6 STAGE 2 DONE: % osteopathy version % row(s) inserted, % audit row(s)', v_n, v_to, v_m;
END $fv6w$;

COMMIT;

\echo ''
\echo '=== FICHA-V6 STAGE 2 COMMITTED ==='
