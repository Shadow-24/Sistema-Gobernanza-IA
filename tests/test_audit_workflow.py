import json
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from api import database, main as api_main


class AuditWorkflowTests(unittest.TestCase):
    def test_registration_date_is_saved_once_and_returned(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        expected = [{"audit_id": "AUD-01", "registered_at": "2026-11-01T00:00:00Z"}]
        connection.execute.return_value.fetchall.return_value = expected

        with patch.object(database, "connection", return_value=connection_context):
            result = database.register_audits(["AUD-01"])

        self.assertEqual(result, expected)
        insert_sql = connection.execute.call_args_list[0].args[0]
        self.assertIn("ON CONFLICT (audit_id) DO NOTHING", insert_sql)
        self.assertIn("SELECT created_at FROM audit_workflow", insert_sql)
        self.assertEqual(connection.execute.call_args_list[0].args[1], ("AUD-01", "AUD-01"))

    def test_audit_registration_endpoint_requires_audit_permission(self) -> None:
        request = api_main.AuditRegistrationRequest(audit_ids=["AUD-01"])

        with patch.object(api_main.database, "register_audits") as register:
            with self.assertRaises(HTTPException) as raised:
                api_main.register_audits(request, {"permissions": ["dashboard"]})

        self.assertEqual(raised.exception.status_code, 403)
        register.assert_not_called()

    def test_initializes_audits_through_database_cursor(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        cursor = connection.cursor.return_value.__enter__.return_value
        connection.execute.return_value.fetchone.return_value = None

        with patch.object(database, "connection", return_value=connection_context):
            database.initialize_audit_workflow()

        cursor.executemany.assert_called_once()
        self.assertEqual(
            [audit[0] for audit in cursor.executemany.call_args.args[1]],
            [f"AUD-{index:02d}" for index in range(1, 8)],
        )

    def test_renames_audit_workflows_and_preserves_related_records(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value

        def execute(statement: str, parameters: tuple[str, ...] | None = None) -> MagicMock:
            is_rename = (
                "INSERT INTO audit_workflow_migrations" in statement
                and parameters == ("rename-audit-workflow-ids-2026-11",)
            )
            result = MagicMock()
            result.fetchone.return_value = (
                {"migration_id": "rename-audit-workflow-ids-2026-11"} if is_rename else None
            )
            return result

        connection.execute.side_effect = execute

        with patch.object(database, "connection", return_value=connection_context):
            database.initialize_audit_workflow()

        expected = (
            ("AUD-2025-004", "AUD-01"),
            ("AUD-2025-002", "AUD-02"),
            ("AUD-2025-001", "AUD-03"),
            ("AUD-2024-052", "AUD-04"),
            ("AUD-2024-038", "AUD-05"),
            ("AUD-2024-035", "AUD-06"),
            ("AUD-2024-031", "AUD-07"),
        )
        statements = connection.execute.call_args_list
        for old_id, new_id in expected:
            self.assertTrue(any(
                "INSERT INTO audit_workflow (" in call.args[0]
                and "created_at, updated_at" in call.args[0]
                and call.args[1] == (new_id, old_id)
                for call in statements
            ))
            for table in ("audit_workflow_events", "audit_documents"):
                self.assertTrue(any(
                    f"UPDATE {table} SET audit_id" in call.args[0]
                    and call.args[1] == (new_id, old_id)
                    for call in statements
                ))

    def test_lists_audit_registration_timestamp(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        expected = [{"audit_id": "AUD-01", "created_at": "2026-11-01T00:00:00Z"}]
        connection.execute.return_value.fetchall.return_value = expected

        with patch.object(database, "connection", return_value=connection_context):
            result = database.list_audit_workflow()

        self.assertEqual(result, expected)
        self.assertIn("created_at", connection.execute.call_args.args[0])

    def test_one_time_reset_clears_workflow_events_and_preserves_documents(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value

        with patch.object(database, "connection", return_value=connection_context):
            connection.execute.side_effect = [
                MagicMock(fetchone=MagicMock(return_value=None)),
                MagicMock(fetchone=MagicMock(return_value={"migration_id": "reset-audit-workflow-2026-11"})),
                MagicMock(),
                MagicMock(),
                MagicMock(fetchone=MagicMock(return_value=None)),
            ]
            database.initialize_audit_workflow()

        statements = [call.args[0] for call in connection.execute.call_args_list]
        self.assertTrue(any("INSERT INTO audit_workflow_migrations" in statement for statement in statements))
        reset_workflow_call = next(
            call for call in connection.execute.call_args_list
            if "SET status = 'Pendiente'" in call.args[0]
        )
        self.assertIn("WHERE audit_id = %s", reset_workflow_call.args[0])
        self.assertEqual(reset_workflow_call.args[1], ("AUD-01",))
        reset_events_call = next(
            call for call in connection.execute.call_args_list
            if "DELETE FROM audit_workflow_events" in call.args[0]
        )
        self.assertIn("WHERE audit_id = %s", reset_events_call.args[0])
        self.assertEqual(reset_events_call.args[1], ("AUD-01",))
        self.assertFalse(any("DELETE FROM audit_documents" in statement for statement in statements))

    def test_one_time_timeline_clear_preserves_current_workflow_and_documents(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value

        with patch.object(database, "connection", return_value=connection_context):
            connection.execute.side_effect = [
                MagicMock(fetchone=MagicMock(return_value=None)),
                MagicMock(fetchone=MagicMock(return_value=None)),
                MagicMock(fetchone=MagicMock(return_value={"migration_id": "clear-audit-timeline-2026-11"})),
                MagicMock(),
            ]
            database.initialize_audit_workflow()

        statements = [call.args[0] for call in connection.execute.call_args_list]
        clear_events_call = next(
            call for call in connection.execute.call_args_list
            if "DELETE FROM audit_workflow_events" in call.args[0]
        )
        self.assertIn("WHERE audit_id = %s", clear_events_call.args[0])
        self.assertEqual(clear_events_call.args[1], ("AUD-01",))
        self.assertFalse(any("UPDATE audit_workflow" in statement for statement in statements))
        self.assertFalse(any("DELETE FROM audit_documents" in statement for statement in statements))

    def test_saves_and_returns_audit_document_category(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        document = {
            "id": "document-1",
            "audit_id": "AUD-01",
            "category": "Resoluciones",
            "file_name": "resolucion.pdf",
        }
        connection.execute.side_effect = [
            MagicMock(fetchone=MagicMock(return_value={"exists": 1})),
            MagicMock(fetchone=MagicMock(return_value=document)),
            MagicMock(),
        ]

        with patch.object(database, "connection", return_value=connection_context):
            saved = database.save_audit_document(
                document_id="document-1",
                audit_id="AUD-01",
                category="Resoluciones",
                file_name="resolucion.pdf",
                media_type="application/pdf",
                content=b"document",
                checksum="checksum",
                username="supervisor",
            )

        self.assertEqual(saved, document)
        insert = connection.execute.call_args_list[1]
        self.assertIn("category, file_name", insert.args[0])
        self.assertEqual(insert.args[1][2], "Resoluciones")
        self.assertIn("Documento (Resoluciones) adjuntado", connection.execute.call_args_list[2].args[1][1])

    def test_database_saves_status_without_progress_input(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        current = {
            "status": "En curso",
            "phase": "Planificación",
            "responsible": "ana",
            "notes": "Nota previa",
        }
        updated = {
            "audit_id": "AUD-01",
            "status": "En curso",
            "phase": "Análisis",
            "responsible": "ana",
            "notes": "Nota actualizada",
            "updated_by": "supervisor",
        }
        connection.execute.side_effect = [
            MagicMock(fetchone=MagicMock(return_value=current)),
            MagicMock(fetchone=MagicMock(return_value={"username": "ana"})),
            MagicMock(fetchone=MagicMock(return_value=updated)),
            MagicMock(),
        ]

        with patch.object(database, "connection", return_value=connection_context):
            result = database.update_audit_workflow(
                "AUD-01",
                "En curso",
                "Análisis",
                "ana",
                "Nota actualizada",
                "supervisor",
            )

        self.assertEqual(result["status"], "En curso")
        update_parameters = connection.execute.call_args_list[2].args[1]
        self.assertEqual(update_parameters, ("En curso", "Análisis", "ana", "Nota actualizada", "supervisor", "AUD-01"))
        event_inserts = [
            call for call in connection.execute.call_args_list
            if "INSERT INTO audit_workflow_events" in call.args[0]
        ]
        self.assertEqual(len(event_inserts), 1)
        timeline_insert = event_inserts[0].args[1]
        changes = json.loads(timeline_insert[1])["changes"]
        self.assertEqual(timeline_insert[2], "supervisor")
        self.assertEqual([change["field"] for change in changes], ["phase", "notes"])

    def test_rejects_responsible_without_audit_permission(self) -> None:
        request = api_main.AuditWorkflowUpdate(
            status="En curso",
            phase="Planificación",
            responsible="inactive-user",
            notes="Nota obligatoria",
        )

        with patch.object(
            api_main.database,
            "update_audit_workflow",
            side_effect=ValueError("El responsable debe ser un usuario activo con permiso de Auditoría."),
        ):
            with self.assertRaises(HTTPException) as raised:
                api_main.update_audit_workflow(
                    "AUD-01",
                    request,
                    {"username": "supervisor"},
                )

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("permiso de Auditoría", raised.exception.detail)

    def test_workflow_changes_are_saved_with_trimmed_values_and_actor(self) -> None:
        request = api_main.AuditWorkflowUpdate(
            status="En curso",
            phase="Análisis",
            responsible="ana",
            notes="  Revisar evidencia  ",
        )
        user = {"username": "supervisor"}
        expected = {"audit_id": "AUD-01", "status": "En curso"}

        with patch.object(api_main.database, "update_audit_workflow", return_value=expected) as update:
            result = api_main.update_audit_workflow("AUD-01", request, user)

        self.assertEqual(result, expected)
        update.assert_called_once_with(
            "AUD-01",
            "En curso",
            "Análisis",
            "ana",
            "Revisar evidencia",
            "supervisor",
        )

    def test_requires_responsible_before_saving_workflow(self) -> None:
        request = api_main.AuditWorkflowUpdate(
            status="En curso",
            phase="Planificación",
            responsible=" ",
            notes="Nota de seguimiento",
        )

        with patch.object(api_main.database, "update_audit_workflow") as update:
            with self.assertRaises(HTTPException) as raised:
                api_main.update_audit_workflow("AUD-01", request, {"username": "supervisor"})

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("responsable", raised.exception.detail)
        update.assert_not_called()

    def test_requires_nonblank_follow_up_note(self) -> None:
        request = api_main.AuditWorkflowUpdate(
            status="En curso",
            phase="Planificación",
            responsible="Ana",
            notes=" ",
        )

        with patch.object(api_main.database, "update_audit_workflow") as update:
            with self.assertRaises(HTTPException) as raised:
                api_main.update_audit_workflow("AUD-01", request, {"username": "supervisor"})

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("nota", raised.exception.detail)
        update.assert_not_called()

    def test_only_audit_supervisor_can_manage_audits(self) -> None:
        supervisor = {"role": "Supervisor de Cumplimiento", "permissions": ["auditoria"]}
        self.assertIs(api_main.get_audit_manager(supervisor), supervisor)

        with self.assertRaises(HTTPException) as raised:
            api_main.get_audit_manager({"role": "Analista de Datos", "permissions": ["auditoria"]})

        self.assertEqual(raised.exception.status_code, 403)

    def test_deletes_audit_document_and_records_the_actor(self) -> None:
        expected = {"audit_id": "AUD-01", "file_name": "evidencia.pdf"}
        user = {"username": "supervisor"}

        with patch.object(api_main.database, "delete_audit_document", return_value=expected) as delete:
            response = api_main.delete_audit_document("document-id", user)

        self.assertEqual(response.status_code, 204)
        delete.assert_called_once_with("document-id", "supervisor")

    def test_missing_audit_document_returns_not_found(self) -> None:
        with patch.object(api_main.database, "delete_audit_document", return_value=None):
            with self.assertRaises(HTTPException) as raised:
                api_main.delete_audit_document("missing-document", {"username": "supervisor"})

        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
